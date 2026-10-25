// Release builds on Windows should not open a console window alongside the app.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    kinora_lib::run();
}
