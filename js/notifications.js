window.AT = window.AT || {};

window.AT.notifications = (function() {
  let messaging = null;
  let db = null;

  const firebaseConfig = {
    apiKey: "AIzaSyD34-PHB3DmI2pAoYXkPs8s-AZSo0UBeEg",
    authDomain: "trading-974f1.firebaseapp.com",
    projectId: "trading-974f1",
    storageBucket: "trading-974f1.firebasestorage.app",
    messagingSenderId: "421347887514",
    appId: "1:421347887514:web:af34e0571d7bf6389b5223"
  };

  const VAPID_KEY = "BDWTopy1ZAxzDrey2JSAUY8EdMm5BTw_VV_-Kx-p6JoNy0XknbbKO2RFd1jcgDaq2xnbJ8ljmE7EoTqUaL2Knpk";

  function init() {
    if (!window.firebase) return;
    
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
    
    messaging = firebase.messaging();
    db = firebase.firestore();

    messaging.onMessage(function(payload) {
      if (Notification.permission === 'granted') {
        new Notification(payload.notification.title, {
          body: payload.notification.body,
          icon: 'https://cdn-icons-png.flaticon.com/512/2933/2933190.png'
        });
      }
    });

    if (Notification.permission === 'granted') {
      getToken();
    } else if (Notification.permission === 'default') {
      Notification.requestPermission().then(function(permission) {
        if (permission === 'granted') getToken();
      });
    }
  }

  function getToken() {
    messaging.getToken({ vapidKey: VAPID_KEY }).then(function(currentToken) {
      if (currentToken) {
        db.collection('tokens').doc(currentToken).set({
          token: currentToken,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          activo: true
        }).catch(function(err) {
          console.error('Error al guardar token:', err);
        });
      }
    }).catch(function(err) {
      console.error('Error al obtener el token:', err);
    });
  }

  return { init: init };
})();