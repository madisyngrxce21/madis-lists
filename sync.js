/*
  Optional cross-device sync via Firebase Firestore.

  Disabled by default — every page keeps working exactly as before, saving
  only to localStorage, until a "sync code" is stored under SYNC_CODE_KEY
  (set from the home page's Sync card). Once a code is present, each page
  mirrors its single localStorage blob to Firestore at
  /syncs/{code}/state/{storageKey} and listens for changes from other
  devices using the same code.

  There is no login system: the code itself is the credential, like an
  "anyone with this link" share. Firestore rules only check that the code
  is long enough to not be guessable — so treat your sync code like a
  password and don't share it publicly.
*/
(function () {
  const FIREBASE_CONFIG = {
    projectId: "madis-lists-sync",
    appId: "1:1093959958965:web:0652e3ed9e03b49b1b59fc",
    storageBucket: "madis-lists-sync.firebasestorage.app",
    apiKey: "AIzaSyCsWlUuylAKBGDOPovMRp2_24TKwBbRQOg",
    authDomain: "madis-lists-sync.firebaseapp.com",
    messagingSenderId: "1093959958965",
  };
  const SYNC_CODE_KEY = "madis-sync-code";
  const MIN_CODE_LENGTH = 16;
  const SDK_VERSION = "10.14.1";

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error("Failed to load " + src));
      document.head.appendChild(s);
    });
  }

  let dbPromise = null;
  function getDb() {
    if (!dbPromise) {
      dbPromise = loadScript(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-app-compat.js`)
        .then(() => loadScript(`https://www.gstatic.com/firebasejs/${SDK_VERSION}/firebase-firestore-compat.js`))
        .then(() => {
          if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
          return firebase.firestore();
        });
    }
    return dbPromise;
  }

  function getCode() {
    return (localStorage.getItem(SYNC_CODE_KEY) || "").trim();
  }

  function makeCode() {
    const bytes = new Uint8Array(15);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 20);
  }

  const MadiSync = {
    getCode,
    isEnabled() {
      return getCode().length >= MIN_CODE_LENGTH;
    },
    makeCode,
    setCode(code) {
      const trimmed = (code || "").trim();
      if (trimmed) localStorage.setItem(SYNC_CODE_KEY, trimmed);
      else localStorage.removeItem(SYNC_CODE_KEY);
    },

    // Call once per page load. onRemoteChange(rawJsonString) fires whenever
    // another device pushes a change for this same storageKey.
    init(storageKey, onRemoteChange) {
      const code = getCode();
      if (code.length < MIN_CODE_LENGTH) return;

      let lastPushedJson = null;
      let gotFirstSnapshot = false;

      getDb()
        .then((db) => {
          const ref = db.collection("syncs").doc(code).collection("state").doc(storageKey);

          ref.onSnapshot(
            (snap) => {
              const localJson = localStorage.getItem(storageKey);

              if (!snap.exists) {
                // Nothing in the cloud yet for this code — seed it with
                // whatever this device already has locally, once.
                if (!gotFirstSnapshot && localJson) {
                  lastPushedJson = localJson;
                  ref.set({ json: localJson, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
                }
                gotFirstSnapshot = true;
                return;
              }
              gotFirstSnapshot = true;

              const data = snap.data();
              if (!data || typeof data.json !== "string") return;
              if (data.json === lastPushedJson) return; // echo of our own write
              if (data.json === localJson) return; // no actual change
              localStorage.setItem(storageKey, data.json);
              onRemoteChange(data.json);
            },
            (err) => console.error("MadiSync snapshot error", storageKey, err)
          );

          MadiSync._pushers = MadiSync._pushers || {};
          MadiSync._pushers[storageKey] = (json) => {
            lastPushedJson = json;
            ref
              .set({ json, updatedAt: firebase.firestore.FieldValue.serverTimestamp() })
              .catch((err) => console.error("MadiSync push error", storageKey, err));
          };
        })
        .catch((err) => console.error("MadiSync init error", storageKey, err));
    },

    push(storageKey, json) {
      if (!this.isEnabled()) return;
      if (this._pushers && this._pushers[storageKey]) this._pushers[storageKey](json);
    },
  };

  window.MadiSync = MadiSync;
})();
