# Build Windows App

This project can now be packaged as a Windows desktop app with the icon files in the project root.

## Requirements

- Node.js 20 or newer
- npm

## Install dependencies

```powershell
npm install
```

## Run as desktop app

```powershell
npm start
```

## Build Windows installer

```powershell
npm run dist
```

The installer output will be created in:

```text
dist\
```

## Optional portable build

```powershell
npm run dist:portable
```

## Icon sources

- `app-icon.ico` for Windows installer and app shortcut
- `icon-192.png` and `icon-512.png` for web/PWA icon usage
