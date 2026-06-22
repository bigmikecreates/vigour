use futures_util::{SinkExt, StreamExt};
use std::sync::Arc;
use tokio::net::TcpListener;
use tokio::sync::Mutex;
use tokio_tungstenite::accept_async;

pub type ClientEntry = tokio::sync::mpsc::UnboundedSender<String>;
pub type Clients = Arc<Mutex<Vec<ClientEntry>>>;

/// Broadcast a JSON message to all connected WebSocket clients.
pub fn broadcast(clients: &Clients, message: &str) {
    let clients = clients.blocking_lock();
    for tx in clients.iter() {
        let _ = tx.send(message.to_string());
    }
}

/// Start the WebSocket server on the given port. Runs until the shutdown signal is received.
pub async fn start_server(port: u16, clients: Clients) -> Result<(), Box<dyn std::error::Error>> {
    let addr = format!("127.0.0.1:{}", port);
    let listener = TcpListener::bind(&addr).await?;
    println!("Vigour WebSocket IPC running on ws://{}", addr);

    loop {
        let (stream, _) = listener.accept().await?;
        let clients = clients.clone();

        tokio::spawn(async move {
            let ws_stream = match accept_async(stream).await {
                Ok(ws) => ws,
                Err(e) => {
                    eprintln!("WebSocket accept error: {}", e);
                    return;
                }
            };

            let (mut ws_sender, mut ws_receiver) = ws_stream.split();
            let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<String>();

            {
                let mut set = clients.lock().await;
                set.push(tx);
            }

            // Forward messages from broadcast to WebSocket
            let send_task = tokio::spawn(async move {
                while let Some(msg) = rx.recv().await {
                    if ws_sender
                        .send(tokio_tungstenite::tungstenite::Message::Text(msg.into()))
                        .await
                        .is_err()
                    {
                        break;
                    }
                }
            });

            // Receive messages from WebSocket (cortex -> overlay)
            while let Some(msg) = ws_receiver.next().await {
                if let Ok(tokio_tungstenite::tungstenite::Message::Text(text)) = msg {
                    println!("[ws] cortex: {}", text);
                }
            }

            send_task.abort();

            // Remove disconnected client
            let mut set = clients.lock().await;
            set.retain(|c| !c.is_closed());
        });
    }
}
