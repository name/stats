use std::sync::mpsc;
use tray_item::{IconSource, TrayItem};
use rdev::{listen, Event};
use std::thread;
use chrono::{DateTime, Utc};
use std::time::SystemTime;
use std::fs::File;
use std::io::Write;

enum Message {
    Quit,
    InputEvent(Event),
}

fn system_time_to_mysql_timestamp(time: SystemTime) -> String {
    let datetime: DateTime<Utc> = time.into();
    datetime.format("%Y-%m-%d %H:%M:%S").to_string()
}

fn parse_event(event: &Event, total_distance: &mut f64) -> Option<String> {
    let timestamp = system_time_to_mysql_timestamp(event.time);
    
    match &event.event_type {
        rdev::EventType::MouseMove { x: _, y: _ } => {
            *total_distance += 1.0;
            let feet = *total_distance * 0.000868044619422571;
            if feet >= 1.0 {
                let log_entry = format!("{},MouseMove,{:.6}", timestamp, feet);
                *total_distance = 0.0; // Reset the total distance
                Some(log_entry)
            } else {
                None
            }
        },
        rdev::EventType::KeyPress(_key) => Some(format!("{},KeyPress,0.000000", timestamp)),
        rdev::EventType::ButtonPress(button) => Some(format!("{},{:?},0.000000", timestamp, button)),
        _ => None,
    }
}

fn main() -> std::io::Result<()> {
    // Create a new directory for the logs
    std::fs::create_dir_all("C:\\Monitor\\logs")?;
    let mut log_file = File::create("C:\\Monitor\\logs\\input_log.csv")?;
    writeln!(log_file, "Timestamp,EventType,Details")?;

    let mut tray = TrayItem::new(
        "1λ.com monitor",
        IconSource::Resource("tray-default"),
    )
    .unwrap();

    tray.add_label("1λ.com monitor").unwrap();

    let (tx, rx) = mpsc::channel();

    let quit_tx = tx.clone();
    tray.add_menu_item("Quit", move || {
        quit_tx.send(Message::Quit).unwrap();
    })
    .unwrap();

    let mut total_distance = 0.0;

    let input_tx = tx.clone();
    thread::spawn(move || {
        if let Err(error) = listen(move |event| {
            input_tx.send(Message::InputEvent(event)).unwrap();
        }) {
            println!("Error: {:?}", error);
        }
    });

    loop {
        match rx.recv() {
            Ok(Message::Quit) => {
                println!("Quit");
                break;
            }
            Ok(Message::InputEvent(event)) => {
                if let Some(parsed) = parse_event(&event, &mut total_distance) {
                    println!("{}", parsed);
                    writeln!(log_file, "{}", parsed)?;
                    log_file.flush()?;
                }
            }
            Err(_) => break,
        }
    }

    Ok(())
}
