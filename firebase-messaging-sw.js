importScripts('https://www.gstatic.com/firebasejs/13.3.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/13.3.0/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyD34-PHB3DmI2pAoYXkPs8s-AZSo0UBeEg",
  authDomain: "trading-974f1.firebaseapp.com",
  projectId: "trading-974f1",
  storageBucket: "trading-974f1.firebasestorage.app",
  messagingSenderId: "421347887514",
  appId: "1:421347887514:web:af34e0571d7bf6389b5223"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: 'https://cdn-icons-png.flaticon.com/512/2933/2933190.png'
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});