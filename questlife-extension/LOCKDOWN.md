# 🔒 LOCKDOWN Mode — Making QuestLife Impossible to Disable

> "Tie yourself to the mast before the sirens sing."
> — Ulysses, probably

This guide describes how to make the QuestLife extension **un-disableable
from inside Chrome** by enrolling it via Chrome Enterprise Policy
(`ExtensionInstallForcelist`). Once installed:

- The toggle in `chrome://extensions` is **greyed out**.
- The "Remove" button is **gone**.
- Dev mode can no longer load a rogue unpacked copy that replaces it.
- The only way to turn it off is to remove the policy file as root.

This is a **one-time setup**. After it's done, drunk-you / tired-you / 2 AM-you
cannot disable the extension without sudo + conscious knowledge of these
instructions. That's the whole point.

> ⚠️ **This is a real thing you are doing to yourself.** Only do it if you
> genuinely want to be bound to it. Once enrolled, the extension becomes part
> of your system until you come back here with root.

---

## Prerequisites

- Linux with Chrome / Chromium / Google Chrome installed
- `sudo` access
- The extension packed as a `.crx` (or published to the Chrome Web Store)
- A stable place to host `updates.xml` + the `.crx` file

For a macOS or Windows machine the JSON payload is identical; only the
file paths and hosting commands differ. See the "Other OS" section at the
bottom.

---

## Step 1 — Generate a stable extension ID

Chrome derives the extension ID from the public key embedded in the
manifest. For an unpacked extension that key is regenerated every time you
load it, which means the ID drifts and `ExtensionInstallForcelist` loses
track. To nail it down:

```bash
cd ~/path/to/MyWebsite
# Generate a private key (keep this file SAFE — it controls your extension)
openssl genrsa -out questlife-extension.pem 2048

# Derive the public key in the format Chrome expects (base64 DER)
openssl rsa -in questlife-extension.pem -pubout -outform DER 2>/dev/null \
  | openssl base64 -A
```

Copy the base64 string into `questlife-extension/manifest.json`:

```json
{
  "manifest_version": 3,
  "name": "QuestLife - Site Blocker",
  "key": "<PASTE THE BASE64 STRING HERE>",
  ...
}
```

To compute the resulting extension ID (you'll need it for the policy file):

```bash
# Decode the base64 back to binary and SHA-256 it; the first 32 hex chars,
# shifted from 0–f to a–p, is the extension ID.
echo -n "<the base64 string>" | base64 -d | sha256sum | cut -c1-32 \
  | tr '0-9a-f' 'a-p'
```

Write down this 32-character ID. Call it `$EXT_ID`.

---

## Step 2 — Pack the extension as `.crx`

```bash
# From anywhere with Chrome installed:
google-chrome \
  --pack-extension=/absolute/path/to/MyWebsite/questlife-extension \
  --pack-extension-key=/absolute/path/to/MyWebsite/questlife-extension.pem
```

That emits `questlife-extension.crx` next to the source folder. Keep the
`.pem` file safe — if you lose it, any future update will change the ID
and break the forcelist.

---

## Step 3 — Host `updates.xml` + `.crx`

Chrome's enterprise policy expects an `update_url` that returns an XML
manifest pointing at the `.crx`. You can host it anywhere Chrome can
reach — local filesystem, GitHub raw, a private web server. For a
personal setup the simplest option is a local file URL.

Create `~/questlife-updates.xml`:

```xml
<?xml version='1.0' encoding='UTF-8'?>
<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>
  <app appid='EXT_ID_HERE'>
    <updatecheck
      codebase='file:///home/you/questlife-extension.crx'
      version='1.0.0' />
  </app>
</gupdate>
```

Replace `EXT_ID_HERE` with the ID from Step 1 and `/home/you/...` with the
actual absolute path to your `.crx`. The `version` must match the one in
`manifest.json` — bump both when you ship an update.

---

## Step 4 — Write the Chrome policy file

Chrome reads managed-policy JSON from a system directory. On Linux that's
`/etc/opt/chrome/policies/managed/` (for Google Chrome) or
`/etc/chromium/policies/managed/` (for Chromium). Create the directory if
it doesn't exist:

```bash
sudo mkdir -p /etc/opt/chrome/policies/managed
# ...and/or...
sudo mkdir -p /etc/chromium/policies/managed
```

Create the file `questlife-lockdown.json`:

```json
{
  "ExtensionInstallForcelist": [
    "EXT_ID_HERE;file:///home/you/questlife-updates.xml"
  ],
  "ExtensionSettings": {
    "EXT_ID_HERE": {
      "installation_mode": "force_installed",
      "update_url": "file:///home/you/questlife-updates.xml",
      "toolbar_pin": "force_pinned"
    }
  }
}
```

Replace `EXT_ID_HERE` with your extension ID (twice!) and the
`file:///home/you/...` path with the real absolute path to your
`updates.xml`.

Move it into place:

```bash
sudo mv questlife-lockdown.json /etc/opt/chrome/policies/managed/
# mirror for Chromium:
sudo cp /etc/opt/chrome/policies/managed/questlife-lockdown.json \
        /etc/chromium/policies/managed/ 2>/dev/null || true
sudo chmod 644 /etc/opt/chrome/policies/managed/questlife-lockdown.json
```

---

## Step 5 — Make the policy file itself hard to delete (optional but nice)

Even with `sudo`, you will occasionally feel tempted to just `rm` the
policy file. Add an immutability flag so that even root has to consciously
lift it first. On ext4 / xfs / btrfs filesystems:

```bash
sudo chattr +i /etc/opt/chrome/policies/managed/questlife-lockdown.json
```

Now `rm` fails with "Operation not permitted" even for root. To remove the
policy later you must explicitly:

```bash
sudo chattr -i /etc/opt/chrome/policies/managed/questlife-lockdown.json
sudo rm     /etc/opt/chrome/policies/managed/questlife-lockdown.json
```

Two commands instead of one — a few seconds of friction between "impulse"
and "action" is what the whole file is here for.

---

## Step 6 — Verify it worked

1. Restart Chrome completely (`pkill chrome && google-chrome`).
2. Open `chrome://policy`. You should see `ExtensionInstallForcelist` and
   `ExtensionSettings` listed with source `Platform`.
3. Open `chrome://extensions`. Find QuestLife. You should see:
   - A blue "Installed by your administrator" badge.
   - The enable/disable toggle should be **greyed out**.
   - The "Remove" button should be **missing or disabled**.
4. Try to disable it. You can't. That's the point.

If the extension doesn't appear, check `chrome://policy` for errors and
confirm the extension ID matches what you computed in Step 1.

---

## How to undo LOCKDOWN (the conscious way out)

You will, at some point, need to genuinely disable this — to update the
extension, debug an issue, or because you moved past needing it. The
procedure is deliberately multi-step:

```bash
# 1. Remove immutable flag if you set it
sudo chattr -i /etc/opt/chrome/policies/managed/questlife-lockdown.json

# 2. Delete the policy file
sudo rm /etc/opt/chrome/policies/managed/questlife-lockdown.json
sudo rm /etc/chromium/policies/managed/questlife-lockdown.json 2>/dev/null || true

# 3. Fully restart Chrome so it re-reads the policy directory
pkill -9 chrome
google-chrome
```

After restart, open `chrome://extensions` — the QuestLife toggle will be
live again, and you can disable or remove it normally.

**Note:** this is the only escape hatch. If you want the willpower contract
to be meaningful, don't memorise this block — put it in a sealed envelope,
commit it to paper, or whatever ritual makes "turn off the blocker" a
conscious decision instead of a reflex.

---

## Other OS

### macOS

- Policy directory:
  `/Library/Managed Preferences/com.google.Chrome.plist`
  (converted from JSON via `plutil` or `defaults write`). Same keys.
- Immutability via `chflags schg` instead of `chattr +i`.

### Windows

- Policy lives in the registry under
  `HKLM\Software\Policies\Google\Chrome\ExtensionInstallForcelist`
  as a multi-string value. Each entry is
  `EXT_ID;https://path/to/updates.xml`.
- No direct equivalent of `chattr +i`; instead deny yourself `Delete`
  permission on the registry key via `regedit → Permissions`.

---

## Rationale (why this is the ONLY way)

I looked into every alternative:

| Option | Why it fails |
|---|---|
| Password-protect `chrome://extensions` | Not a Chrome feature. |
| Chrome extension that blocks `chrome://extensions` | `chrome://` pages are off-limits to extensions — that's the whole sandbox. |
| Another extension that re-enables the blocker when disabled | Also off-limits; management API requires install-by-admin or packaged. Circular. |
| Parental controls / Screen Time | Cross-platform mess, easily bypassed by launching Chromium or Firefox. |
| Just use willpower lol | See: the entire reason this file exists. |

`ExtensionInstallForcelist` is the only mechanism that Chrome itself
honours. It's designed for corporate environments, but nothing stops a
single user from applying it to their own machine. And it works.

---

## What this file is NOT

It is **not** magical — a determined user can always:

- Boot from a live USB and `rm` the policy file.
- Use a completely different browser.
- Delete Chrome and install it fresh (policies re-read on next start).

The goal isn't to build a prison. The goal is to build *enough friction*
that when tired-you reaches for "disable the blocker," the path of least
resistance is to just close the tab and go to sleep. Every second of
friction between impulse and action is a second your prefrontal cortex
has to step in.

If you circumvent the lockdown, log it in the shame log (click the 🏳️
button in the header of the app — or the site will log it automatically
via the uninstall-URL redirect next time you load Quest Manager). The
cost is the point.
