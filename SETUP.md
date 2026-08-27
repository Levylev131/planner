# One-time setup

This app stores events in a Firebase Firestore database and syncs both of you to it **in real time** — when either person adds/edits/deletes an event, the other person's screen updates within a second or two, no refresh needed. Do these steps yourself in the Firebase console (free tier is plenty for 2 people).

## 1. Create a Firebase project

1. Go to https://console.firebase.google.com
2. Click **Add project**, give it a name (e.g. "our-calendar"), and finish the wizard (Google Analytics is optional — you can skip it).

## 2. Turn on Firestore

1. In the left sidebar, click **Build > Firestore Database**.
2. Click **Create database**.
3. Choose **Start in test mode** for now (we'll lock it down properly in step 4).
4. Pick the region closest to you, click **Enable**.

## 3. Register a web app and get your config

1. In the project overview page, click the **</>** (web) icon to add a web app.
2. Give it a nickname (e.g. "calendar-web"), don't check "Firebase Hosting."
3. It'll show you a `firebaseConfig` object like:
   ```js
   const firebaseConfig = {
     apiKey: "...",
     authDomain: "...",
     projectId: "...",
     storageBucket: "...",
     messagingSenderId: "...",
     appId: "..."
   };
   ```
4. Open `firebase-config.js` in this folder and paste those values in.

   **Note:** unlike a GitHub token, this config is *meant* to be visible in client-side code — Firebase's own docs say so. Real protection comes from the security rules in the next step, not from hiding this file.

## 4. Lock down the security rules

By default "test mode" allows anyone on the internet to read/write your database, and it auto-expires in 30 days. Replace it with rules scoped to just the `events` collection:

1. In Firestore, go to the **Rules** tab.
2. Replace the contents with:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /events/{eventId} {
         allow read, write: if true;
       }
       match /{document=**} {
         allow read, write: if false;
       }
     }
   }
   ```
3. Click **Publish**.

   This means anyone with your app's URL + config could technically read/edit events (same trust model as the Grocery List app's Gist token) — fine since only you two will have the link. If you ever want real access control, tell Claude and we can add Firebase Authentication with an allow-list of your two emails.

## 5. Try it locally

```powershell
python -m http.server 8080
```

Open http://localhost:8080 in a browser. Add an event, then open the same URL in a second tab (or your phone on the same Wi-Fi, using your PC's local IP) — the event should appear there within a second or two.

## 6. Host it so both phones can reach it (tell Claude when ready)

Local hosting only works on your own PC/Wi-Fi. For real access from anywhere, this needs to be pushed to a GitHub repo with GitHub Pages or Netlify — ask Claude to do this once steps 1–5 work.

## Customizing

- **Categories/colors:** edit the `CATEGORIES` array near the top of `app.js` — add, remove, rename, or recolor as you like.
- **App name/icon:** edit `manifest.json` and swap the files in `icons/` (currently placeholders copied from the Grocery List app).
