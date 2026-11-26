//! Standalone headless Kinora Media Server binary.
//! Built without WebKitGTK/GTK desktop dependencies for Linux servers, NAS, Raspberry Pi, and Docker.

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let mut port = std::env::var("KINORA_PORT")
        .or_else(|_| std::env::var("SERVER_PORT"))
        .or_else(|_| std::env::var("PORT"))
        .ok()
        .and_then(|v| v.parse::<u16>().ok());
    let mut pin = std::env::var("KINORA_PIN")
        .ok()
        .filter(|s| !s.trim().is_empty());

    let mut idx = 1;
    while idx < args.len() {
        match args[idx].as_str() {
            "--port" if idx + 1 < args.len() => {
                port = args[idx + 1].parse::<u16>().ok();
                idx += 1;
            }
            "--pin" if idx + 1 < args.len() => {
                pin = Some(args[idx + 1].clone());
                idx += 1;
            }
            "--data-dir" if idx + 1 < args.len() => {
                std::env::set_var("KINORA_DATA_DIR", &args[idx + 1]);
                idx += 1;
            }
            "--help" | "-h" => {
                println!(
                    "Kinora Media Server v{} (Headless)",
                    env!("CARGO_PKG_VERSION")
                );
                println!("Usage: kinora-server [--port <PORT>] [--pin <PIN>] [--data-dir <DIR>]");
                println!("Environment: KINORA_PORT, KINORA_PIN, KINORA_DATA_DIR");
                return;
            }
            _ => {}
        }
        idx += 1;
    }

    kinora_lib::run_headless_server(port, pin);
}
