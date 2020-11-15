const WebSocket = require('ws');

class WebSocketClient {
  constructor(url) {
    this.client = null;
    this.connected = false;
    this.create(url);
  }

  create(url) {
    try {
      this.client = new WebSocket(url);
      this.client.on('open', this.heartbeat);
      this.client.on('ping', this.heartbeat);
      this.client.on('close', function clear() {
        clearTimeout(this.pingTimeout);
      });
      this.client.on('error', () => {
        this.connected = false;
      });
    } catch (error) {}
  }

  heartbeat() {
    this.connected = true;
    clearTimeout(this.pingTimeout);

    // Use `WebSocket#terminate()`, which immediately destroys the connection,
    // instead of `WebSocket#close()`, which waits for the close timer.
    // Delay should be equal to the interval at which your server
    // sends out pings plus a conservative assumption of the latency.
    this.pingTimeout = setTimeout(() => {
      this.connected = false;
      try {
        this.client.terminate();
      } catch (error) {}
    }, 30000 + 2500);
  }

  isConnected() {
    return this.client !== null && this.connected;
  }
}

exports.WebSocketClient = WebSocketClient;
