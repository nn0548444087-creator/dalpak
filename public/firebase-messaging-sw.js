// Shows phone notifications for the web version of the app, also when it is closed.
// The notification text and the link it opens come from the server function (functions/index.js).
importScripts('https://www.gstatic.com/firebasejs/11.0.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.0.2/firebase-messaging-compat.js');
firebase.initializeApp({
  apiKey: 'AIzaSyBPzYN1-V2nZLxqY_7F1dQpuKc04BEBebY',
  authDomain: 'dalpak.firebaseapp.com',
  projectId: 'dalpak',
  storageBucket: 'dalpak.firebasestorage.app',
  messagingSenderId: '531855451338',
  appId: '1:531855451338:web:f4794719b51ef76eb90033'
});
firebase.messaging();
