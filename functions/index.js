const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

exports.enviarNotificacion = functions.firestore
  .document('notificaciones_pendientes/{docId}')
  .onCreate(async (snap, context) => {
    const data = snap.data();
    
    try {
      const tokensSnapshot = await admin.firestore().collection('tokens').where('activo', '==', true).get();
      const tokens = tokensSnapshot.docs.map(doc => doc.data().token);
      
      if (tokens.length === 0) {
        console.log('No hay dispositivos suscritos.');
        return null;
      }

      const mensaje = {
        notification: {
          title: data.title,
          body: data.body
        },
        tokens: tokens
      };

      const response = await admin.messaging().sendMulticast(mensaje);
      console.log(`Notificación enviada a ${response.successCount} dispositivos.`);
      
      await snap.ref.update({ enviado: true });
      return null;

    } catch (error) {
      console.error('Error enviando notificación:', error);
      return null;
    }
  });
