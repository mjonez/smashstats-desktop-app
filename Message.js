const MessageStatus = {
  AUTHENTICATE: 'AUTHENTICATE',
  UPLOAD_GAME: 'UPLOAD_GAME',
  HEARTBEAT: 'HEARTBEAT',
};
class Message {
  constructor(status, payload) {
    this.status = status;
    this.payload = payload;
  }
}
exports.MessageStatus = MessageStatus;
exports.Message = Message;
