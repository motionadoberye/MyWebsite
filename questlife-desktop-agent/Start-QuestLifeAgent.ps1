#requires -version 5.1

[CmdletBinding()]
param(
  [string]$ConfigPath,
  [switch]$Once
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

if ([string]::IsNullOrWhiteSpace($ConfigPath)) {
  $ConfigPath = Join-Path $PSScriptRoot 'config.json'
}

function Normalize-ProcessName {
  param([string]$Name)
  if ([string]::IsNullOrWhiteSpace($Name)) { return $null }
  $n = $Name.Trim().ToLowerInvariant()
  if (-not $n.EndsWith('.exe')) { $n = "$n.exe" }
  return $n
}

function Read-AgentConfig {
  param([string]$Path)
  $fallback = [ordered]@{
    port = 17321
    pollIntervalMs = 1000
    trackedApps = @()
  }
  if (-not (Test-Path -LiteralPath $Path)) { return $fallback }
  try {
    $json = Get-Content -Raw -Encoding UTF8 -LiteralPath $Path | ConvertFrom-Json
    return [ordered]@{
      port = if ($json.port) { [int]$json.port } else { 17321 }
      pollIntervalMs = if ($json.pollIntervalMs) { [int]$json.pollIntervalMs } else { 1000 }
      trackedApps = @($json.trackedApps)
    }
  } catch {
    Write-Warning "Failed to read config '$Path': $($_.Exception.Message)"
    return $fallback
  }
}

if (-not ('QuestLifeNative.Window' -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;

namespace QuestLifeNative {
  public static class Window {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out int processId);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowTextLength(IntPtr hWnd);
  }
}
'@
}

$config = Read-AgentConfig -Path $ConfigPath
$port = [int]$config.port
$pollIntervalMs = [Math]::Max(250, [int]$config.pollIntervalMs)

$trackedApps = @{}
foreach ($app in @($config.trackedApps)) {
  $processName = Normalize-ProcessName $app.process
  if (-not $processName) { continue }
  $trackedApps[$processName] = [ordered]@{
    process = $processName
    label = if ($app.label) { [string]$app.label } else { $processName }
    category = if ($app.category) { [string]$app.category } else { 'tracked' }
  }
}

$script:currentDate = (Get-Date).ToString('yyyy-MM-dd')
$script:todayApps = @{}
$script:totalAllTime = 0.0
$script:lastSampleAt = Get-Date
$script:lastForeground = $null
$script:lastSnapshotAt = [DateTime]::MinValue
$script:historyBuckets = @{}
$dataDir = Join-Path $PSScriptRoot 'data'
$snapshotPath = Join-Path $dataDir 'app-time.json'

function Get-HistoryBucketKey {
  param([DateTime]$At)
  $utc = $At.ToUniversalTime()
  return $utc.ToString('yyyy-MM-ddTHH:00:00Z')
}

function Get-HistoryBucketStart {
  param([DateTime]$At)
  $utc = $At.ToUniversalTime()
  return New-Object DateTime $utc.Year, $utc.Month, $utc.Day, $utc.Hour, 0, 0, ([DateTimeKind]::Utc)
}

function Add-HistorySeconds {
  param(
    [object]$App,
    [double]$Seconds,
    [DateTime]$At
  )
  if (-not $App -or $Seconds -le 0) { return }

  $bucketKey = Get-HistoryBucketKey -At $At
  if (-not $script:historyBuckets.ContainsKey($bucketKey)) {
    $script:historyBuckets[$bucketKey] = [ordered]@{
      bucketStart = (Get-HistoryBucketStart -At $At).ToString('o')
      apps = @{}
    }
  }

  $bucket = $script:historyBuckets[$bucketKey]
  $apps = $bucket['apps']
  $key = $App['process']
  if (-not $apps.ContainsKey($key)) {
    $apps[$key] = [ordered]@{
      process = $key
      label = $App['label']
      category = $App['category']
      isTracked = [bool]$App['isTracked']
      seconds = 0.0
      lastTitle = ''
      lastSeenAt = $null
    }
  }

  $entry = $apps[$key]
  $entry['seconds'] = [Math]::Round(([double]$entry['seconds'] + $Seconds), 3)
  $entry['lastTitle'] = $App['title']
  $entry['lastSeenAt'] = $At.ToUniversalTime().ToString('o')
}

function Prune-HistoryBuckets {
  param([int]$RetentionHours = 72)
  $cutoff = (Get-Date).ToUniversalTime().AddHours(-$RetentionHours)
  foreach ($key in @($script:historyBuckets.Keys)) {
    try {
      $bucketStart = [DateTime]::Parse([string]$script:historyBuckets[$key]['bucketStart']).ToUniversalTime()
      if ($bucketStart -lt $cutoff) {
        $script:historyBuckets.Remove($key)
      }
    } catch {
      $script:historyBuckets.Remove($key)
    }
  }
}

function Import-HistoryBucket {
  param([object]$Bucket)
  if (-not $Bucket) { return }
  $bucketStart = $null
  try { $bucketStart = [DateTime]::Parse([string]$Bucket.bucketStart).ToUniversalTime() } catch { return }
  $bucketKey = Get-HistoryBucketKey -At $bucketStart
  $apps = @{}
  foreach ($prop in @($Bucket.apps.PSObject.Properties)) {
    $app = $prop.Value
    $processName = Normalize-ProcessName $app.process
    if (-not $processName) { continue }
    $apps[$processName] = [ordered]@{
      process = $processName
      label = if ($app.label) { [string]$app.label } else { $processName }
      category = if ($app.category) { [string]$app.category } else { 'other' }
      isTracked = [bool]$app.isTracked
      seconds = [double]($app.seconds -as [double])
      lastTitle = if ($app.lastTitle) { [string]$app.lastTitle } else { '' }
      lastSeenAt = if ($app.lastSeenAt) { [string]$app.lastSeenAt } else { $bucketStart.ToString('o') }
    }
  }
  if ($apps.Count -gt 0) {
    $script:historyBuckets[$bucketKey] = [ordered]@{
      bucketStart = $bucketStart.ToString('o')
      apps = $apps
    }
  }
}

function Load-Snapshot {
  if (-not (Test-Path -LiteralPath $snapshotPath)) { return }
  try {
    $snapshot = Get-Content -Raw -Encoding UTF8 -LiteralPath $snapshotPath | ConvertFrom-Json
    if ($snapshot.historyBuckets) {
      foreach ($bucket in @($snapshot.historyBuckets)) {
        Import-HistoryBucket -Bucket $bucket
      }
    } elseif ($snapshot.today -and $snapshot.today.apps) {
      $bucketStart = Get-HistoryBucketStart -At (Get-Date)
      foreach ($prop in @($snapshot.today.apps.PSObject.Properties)) {
        $app = $prop.Value
        $processName = Normalize-ProcessName $app.process
        if (-not $processName) { continue }
        $seconds = [double]($app.seconds -as [double])
        if ($seconds -le 0) { continue }
        Add-HistorySeconds -App ([ordered]@{
          process = $processName
          label = if ($app.label) { [string]$app.label } else { [string]$app.process }
          category = if ($app.category) { [string]$app.category } else { 'other' }
          isTracked = [bool]$app.isTracked
          title = if ($app.lastTitle) { [string]$app.lastTitle } else { '' }
        }) -Seconds $seconds -At $bucketStart
      }
    }
    Prune-HistoryBuckets -RetentionHours 72
  } catch {
    Write-Warning "Failed to load snapshot '$snapshotPath': $($_.Exception.Message)"
  }
}

function Restore-TodayFromHistory {
  $script:todayApps = @{}
  $script:totalAllTime = 0.0

  foreach ($bucket in @($script:historyBuckets.Values)) {
    if (-not $bucket -or -not $bucket['apps']) { continue }

    try {
      $bucketStart = [DateTime]::Parse([string]$bucket['bucketStart']).ToLocalTime()
    } catch {
      continue
    }

    if ($bucketStart.ToString('yyyy-MM-dd') -ne $script:currentDate) { continue }

    foreach ($key in @($bucket['apps'].Keys)) {
      $entry = $bucket['apps'][$key]
      $seconds = [double]($entry['seconds'] -as [double])
      if ($seconds -le 0) { continue }

      if (-not $script:todayApps.ContainsKey($key)) {
        $script:todayApps[$key] = [ordered]@{
          process = $entry['process']
          label = $entry['label']
          category = $entry['category']
          isTracked = [bool]$entry['isTracked']
          seconds = 0.0
          lastTitle = ''
          lastSeenAt = $null
        }
      }

      $target = $script:todayApps[$key]
      $target['seconds'] = [Math]::Round(([double]$target['seconds'] + $seconds), 3)
      $target['lastTitle'] = $entry['lastTitle']
      $target['lastSeenAt'] = $entry['lastSeenAt']
      $script:totalAllTime = [Math]::Round(($script:totalAllTime + $seconds), 3)
    }
  }
}

function Get-ForegroundApp {
  $hwnd = [QuestLifeNative.Window]::GetForegroundWindow()
  if ($hwnd -eq [IntPtr]::Zero) { return $null }

  [int]$processId = 0
  [void][QuestLifeNative.Window]::GetWindowThreadProcessId($hwnd, [ref]$processId)
  if ($processId -le 0) { return $null }

  try {
    $proc = Get-Process -Id $processId -ErrorAction Stop
  } catch {
    return $null
  }

  $length = [QuestLifeNative.Window]::GetWindowTextLength($hwnd)
  $builder = New-Object System.Text.StringBuilder ([Math]::Max($length + 1, 256))
  [void][QuestLifeNative.Window]::GetWindowText($hwnd, $builder, $builder.Capacity)

  $processName = Normalize-ProcessName $proc.ProcessName
  $isTracked = $trackedApps.ContainsKey($processName)
  $meta = if ($isTracked) { $trackedApps[$processName] } else { $null }

  return [ordered]@{
    process = $processName
    pid = $processId
    title = $builder.ToString()
    label = if ($meta) { $meta['label'] } else { $proc.ProcessName }
    category = if ($meta) { $meta['category'] } else { 'other' }
    isTracked = [bool]$isTracked
  }
}

function Reset-Day-IfNeeded {
  $today = (Get-Date).ToString('yyyy-MM-dd')
  if ($script:currentDate -ne $today) {
    $script:currentDate = $today
    $script:todayApps = @{}
    $script:totalAllTime = 0.0
  }
}

function Add-AppSeconds {
  param(
    [object]$App,
    [double]$Seconds
  )
  if (-not $App -or $Seconds -le 0) { return }
  $safeSeconds = [Math]::Min($Seconds, 10)
  $seenAt = Get-Date
  $key = $App['process']
  if (-not $script:todayApps.ContainsKey($key)) {
    $script:todayApps[$key] = [ordered]@{
      process = $key
      label = $App['label']
      category = $App['category']
      isTracked = [bool]$App['isTracked']
      seconds = 0.0
      lastTitle = ''
      lastSeenAt = $null
    }
  }

  $entry = $script:todayApps[$key]
  $entry['seconds'] = [Math]::Round(([double]$entry['seconds'] + $safeSeconds), 3)
  $entry['lastTitle'] = $App['title']
  $entry['lastSeenAt'] = $seenAt.ToUniversalTime().ToString('o')
  $script:totalAllTime = [Math]::Round(($script:totalAllTime + $safeSeconds), 3)
  Add-HistorySeconds -App $App -Seconds $safeSeconds -At $seenAt
}

function Sample-ForegroundApp {
  Reset-Day-IfNeeded
  $now = Get-Date
  if ($script:lastSampleAt -and $script:lastForeground) {
    $elapsed = ($now - $script:lastSampleAt).TotalSeconds
    if ($elapsed -gt 0) {
      Add-AppSeconds -App $script:lastForeground -Seconds $elapsed
    }
  }
  $script:lastForeground = Get-ForegroundApp
  $script:lastSampleAt = $now
}

function Build-WindowStatsPayload {
  param([int]$Hours = 48)

  Prune-HistoryBuckets -RetentionHours ([Math]::Max($Hours + 24, 72))

  $nowUtc = (Get-Date).ToUniversalTime()
  $cutoffUtc = $nowUtc.AddHours(-$Hours)
  $aggregateApps = [ordered]@{}

  foreach ($bucket in @($script:historyBuckets.Values)) {
    if (-not $bucket -or -not $bucket['apps']) { continue }

    try {
      $bucketStart = [DateTime]::Parse([string]$bucket['bucketStart']).ToUniversalTime()
    } catch {
      continue
    }

    if ($bucketStart -lt $cutoffUtc) { continue }

    foreach ($key in @($bucket['apps'].Keys)) {
      $entry = $bucket['apps'][$key]
      $seconds = [double]($entry['seconds'] -as [double])
      if ($seconds -le 0) { continue }

      if (-not $aggregateApps.Contains($key)) {
        $aggregateApps[$key] = [ordered]@{
          process = $entry['process']
          label = $entry['label']
          category = $entry['category']
          isTracked = [bool]$entry['isTracked']
          seconds = 0.0
          lastTitle = ''
          lastSeenAt = $null
        }
      }

      $target = $aggregateApps[$key]
      $target['seconds'] = [Math]::Round(([double]$target['seconds'] + $seconds), 3)

      $incomingLastSeenAt = if ($entry['lastSeenAt']) { [string]$entry['lastSeenAt'] } else { $bucketStart.ToString('o') }
      $shouldUpdateLastSeen = -not $target['lastSeenAt']
      if (-not $shouldUpdateLastSeen) {
        try {
          $shouldUpdateLastSeen = [DateTime]::Parse($incomingLastSeenAt) -gt [DateTime]::Parse([string]$target['lastSeenAt'])
        } catch {
          $shouldUpdateLastSeen = $false
        }
      }

      if ($shouldUpdateLastSeen) {
        $target['lastTitle'] = $entry['lastTitle']
        $target['lastSeenAt'] = $incomingLastSeenAt
      }
    }
  }

  $apps = [ordered]@{}
  $categories = [ordered]@{}
  $trackedSeconds = 0.0
  $totalSeconds = 0.0

  foreach ($key in $aggregateApps.Keys) {
    $entry = $aggregateApps[$key]
    $seconds = [int][Math]::Floor([double]$entry['seconds'])
    if ($seconds -le 0) { continue }

    $apps[$key] = [ordered]@{
      process = $entry['process']
      label = $entry['label']
      category = $entry['category']
      isTracked = [bool]$entry['isTracked']
      seconds = $seconds
      lastTitle = $entry['lastTitle']
      lastSeenAt = $entry['lastSeenAt']
    }

    $category = $entry['category']
    if (-not $categories.Contains($category)) { $categories[$category] = 0 }
    $categories[$category] = [int]$categories[$category] + $seconds
    if ($entry['isTracked']) { $trackedSeconds += $seconds }
    $totalSeconds += $seconds
  }

  $top = @(
    $apps.GetEnumerator() |
      Sort-Object { -[int]$_.Value['seconds'] } |
      Select-Object -First 20 |
      ForEach-Object {
        [ordered]@{
          process = $_.Value['process']
          label = $_.Value['label']
          category = $_.Value['category']
          isTracked = [bool]$_.Value['isTracked']
          seconds = [int]$_.Value['seconds']
          lastTitle = $_.Value['lastTitle']
          lastSeenAt = $_.Value['lastSeenAt']
        }
      }
  )

  return [ordered]@{
    hours = $Hours
    since = $cutoffUtc.ToString('o')
    until = $nowUtc.ToString('o')
    apps = $apps
    categories = $categories
    totalSeconds = [int][Math]::Floor($totalSeconds)
    trackedSeconds = [int][Math]::Floor($trackedSeconds)
    top = $top
  }
}

function Build-StatsPayload {
  $window48 = Build-WindowStatsPayload -Hours 48
  $apps = [ordered]@{}
  $categories = [ordered]@{}
  $trackedSeconds = 0.0

  foreach ($key in $script:todayApps.Keys) {
    $entry = $script:todayApps[$key]
    $seconds = [int][Math]::Floor([double]$entry['seconds'])
    $apps[$key] = [ordered]@{
      process = $entry['process']
      label = $entry['label']
      category = $entry['category']
      isTracked = [bool]$entry['isTracked']
      seconds = $seconds
      lastTitle = $entry['lastTitle']
      lastSeenAt = $entry['lastSeenAt']
    }

    $category = $entry['category']
    if (-not $categories.Contains($category)) { $categories[$category] = 0 }
    $categories[$category] = [int]$categories[$category] + $seconds
    if ($entry['isTracked']) { $trackedSeconds += $seconds }
  }

  $top = @(
    $apps.GetEnumerator() |
      Sort-Object { -[int]$_.Value['seconds'] } |
      Select-Object -First 20 |
      ForEach-Object {
        [ordered]@{
          process = $_.Value['process']
          label = $_.Value['label']
          category = $_.Value['category']
          isTracked = [bool]$_.Value['isTracked']
          seconds = [int]$_.Value['seconds']
          lastTitle = $_.Value['lastTitle']
          lastSeenAt = $_.Value['lastSeenAt']
        }
      }
  )

  return [ordered]@{
    ok = $true
    date = $script:currentDate
    updatedAt = (Get-Date).ToUniversalTime().ToString('o')
    active = $script:lastForeground
    today = [ordered]@{
      apps = $apps
      categories = $categories
      totalSeconds = [int][Math]::Floor($script:totalAllTime)
      trackedSeconds = [int][Math]::Floor($trackedSeconds)
    }
    totalSeconds = [int][Math]::Floor($script:totalAllTime)
    trackedSeconds = [int][Math]::Floor($trackedSeconds)
    top = $top
    window48 = $window48
    historyBuckets = @($script:historyBuckets.Values)
    config = [ordered]@{
      pollIntervalMs = $pollIntervalMs
      trackedCount = $trackedApps.Count
    }
  }
}

function Save-Snapshot-IfNeeded {
  $now = Get-Date
  if (($now - $script:lastSnapshotAt).TotalSeconds -lt 15) { return }
  Prune-HistoryBuckets -RetentionHours 72
  if (-not (Test-Path -LiteralPath $dataDir)) {
    New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
  }
  Build-StatsPayload | ConvertTo-Json -Depth 10 | Set-Content -Encoding UTF8 -LiteralPath $snapshotPath
  $script:lastSnapshotAt = $now
}

function Send-JsonResponse {
  param(
    [System.Net.HttpListenerContext]$Context,
    [int]$StatusCode,
    $Body
  )
  $json = $Body | ConvertTo-Json -Depth 10
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  $Context.Response.StatusCode = $StatusCode
  $Context.Response.ContentType = 'application/json; charset=utf-8'
  $Context.Response.ContentLength64 = $bytes.Length
  $Context.Response.Headers['Access-Control-Allow-Origin'] = '*'
  $Context.Response.Headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
  $Context.Response.Headers['Access-Control-Allow-Headers'] = 'Content-Type'
  $Context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  $Context.Response.OutputStream.Close()
}

Load-Snapshot
Restore-TodayFromHistory

if ($Once) {
  $sample = Get-ForegroundApp
  ([ordered]@{
    ok = $true
    active = $sample
    trackedCount = $trackedApps.Count
    configPath = (Resolve-Path -LiteralPath $ConfigPath).Path
  } | ConvertTo-Json -Depth 6)
  exit 0
}

$listener = New-Object System.Net.HttpListener
$prefix = "http://127.0.0.1:$port/"
$listener.Prefixes.Add($prefix)

try {
  $listener.Start()
} catch {
  Write-Error "Could not start listener at $prefix. $($_.Exception.Message)"
  exit 1
}

Write-Host "QuestLife Desktop Agent listening at $prefix"
Write-Host "Stats endpoint: ${prefix}stats"
Write-Host "Tracked apps: $($trackedApps.Count)"
Write-Host "Press Ctrl+C to stop."

$script:lastForeground = Get-ForegroundApp
$contextTask = $listener.GetContextAsync()

try {
  while ($listener.IsListening) {
    Sample-ForegroundApp
    Save-Snapshot-IfNeeded

    if ($contextTask.AsyncWaitHandle.WaitOne($pollIntervalMs)) {
      $context = $contextTask.GetAwaiter().GetResult()
      $contextTask = $listener.GetContextAsync()

      if ($context.Request.HttpMethod -eq 'OPTIONS') {
        Send-JsonResponse -Context $context -StatusCode 204 -Body ([ordered]@{})
        continue
      }

      $path = $context.Request.Url.AbsolutePath.TrimEnd('/')
      if ($path -eq '' -or $path -eq '/stats') {
        Send-JsonResponse -Context $context -StatusCode 200 -Body (Build-StatsPayload)
      } elseif ($path -eq '/health') {
        Send-JsonResponse -Context $context -StatusCode 200 -Body ([ordered]@{ ok = $true; date = $script:currentDate })
      } elseif ($path -eq '/config') {
        Send-JsonResponse -Context $context -StatusCode 200 -Body $config
      } else {
        Send-JsonResponse -Context $context -StatusCode 404 -Body ([ordered]@{ ok = $false; error = 'not_found' })
      }
    }
  }
} finally {
  if ($listener.IsListening) { $listener.Stop() }
  $listener.Close()
}
