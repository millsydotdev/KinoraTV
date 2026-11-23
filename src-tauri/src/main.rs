// Release builds on Windows should not open a console window alongside the app.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let is_server = args.iter().any(|arg| arg == "--server" || arg == "--headless")
        || std::env::var("KINORA_MODE").map(|v| v.to_lowercase() == "server").unwrap_or(false);

    if is_server {
        let mut port = None;
        let mut pin = None;
        let mut idx = 1;
        while idx < args.len() {
            if args[idx] == "--port" && idx + 1 < args.len() {
                port = args[idx + 1].parse::<u16>().ok();
                idx += 1;
            } else if args[idx] == "--pin" && idx + 1 < args.len() {
                pin = Some(args[idx + 1].clone());
                idx += 1;
            }
            idx += 1;
        }
        kinora_lib::run_headless_server(port, pin);
    } else {
        kinora_lib::run();
    }
}
