use std::sync::mpsc;
use tray_item::{IconSource, TrayItem};
use rdev::{listen, Event};
use std::thread;
use chrono::{DateTime, Utc, Duration};
use std::time::SystemTime;
use std::fs::{File, OpenOptions};
use std::io::{Write, Seek, SeekFrom};
use mysql::*;
use mysql::prelude::*;
use tokio::time;
use percent_encoding::{percent_encode, NON_ALPHANUMERIC};
use uuid::Uuid;
use csv::ReaderBuilder;
use dotenv::dotenv;
use std::env;

enum Message {
    Quit,
    InputEvent(Event),
    ImportAndReset,
}

fn system_time_to_mysql_timestamp(time: SystemTime) -> String {
    let datetime: DateTime<Utc> = time.into();
    datetime.format("%Y-%m-%d %H:%M:%S").to_string()
}

fn parse_event(event: &Event, total_distance: &mut f64) -> Option<String> {
    let timestamp = system_time_to_mysql_timestamp(event.time);
    let uuid = Uuid::new_v4().to_string();
    
    match &event.event_type {
        rdev::EventType::MouseMove { x: _, y: _ } => {
            *total_distance += 1.0;
            let feet = *total_distance * 0.0005;
            if feet >= 1.0 {
                let log_entry = format!("{},{},MouseMove,{:.6}", uuid, timestamp, feet);
                *total_distance = 0.0; // Reset the total distance
                Some(log_entry)
            } else {
                None
            }
        },
        rdev::EventType::KeyPress(_key) => Some(format!("{},{},KeyPress,0.000000", uuid, timestamp)),
        rdev::EventType::ButtonPress(button) => Some(format!("{},{},{:?},0.000000", uuid, timestamp, button)),
        _ => None,
    }
}

async fn import_csv_to_mysql(file_path: &str) -> Result<(), Box<dyn std::error::Error>> {
    dotenv().ok(); // This loads the .env file

    let db_user = env::var("DB_USER").expect("DB_USER must be set");
    let db_password = env::var("DB_PASSWORD").expect("DB_PASSWORD must be set");
    let db_host = env::var("DB_HOST").expect("DB_HOST must be set");
    let db_port = env::var("DB_PORT").expect("DB_PORT must be set");
    let db_name = env::var("DB_NAME").expect("DB_NAME must be set");

    let encoded_password = percent_encode(db_password.as_bytes(), NON_ALPHANUMERIC).to_string();

    let url_string = format!("mysql://{}:{}@{}:{}/{}", db_user, encoded_password, db_host, db_port, db_name);
    let url = url_string.as_str();
    let pool = Pool::new(url)?;
    let mut conn = pool.get_conn()?;

    // Read the CSV file using csv crate
    let mut rdr = ReaderBuilder::new()
        .has_headers(true)
        .from_path(file_path)?;

    // Prepare the statement
    let stmt = conn.prep(
        r"INSERT INTO input_events (uuid, timestamp, event_type, details) VALUES (?, ?, ?, ?)"
    )?;

    // Iterate over CSV records and execute the prepared statement
    for result in rdr.records() {
        let record = result?;
        if record.len() >= 4 {
            conn.exec_drop(
                &stmt,
                (
                    &record[0],
                    &record[1],
                    &record[2],
                    &record[3],
                ),
            )?;
        } else {
            println!("Skipping invalid record: {:?}", record);
        }
    }

    Ok(())
}

fn reset_file(file: &mut File) -> std::io::Result<()> {
    file.set_len(0)?;
    file.seek(SeekFrom::Start(0))?;
    writeln!(file, "UUID,Timestamp,EventType,Details")?;
    file.flush()?;
    Ok(())
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    std::fs::create_dir_all("C:\\Monitor\\logs")?;
    let file_path = "C:\\Monitor\\logs\\input_log.csv";
    let mut log_file = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .open(file_path)?;
    writeln!(log_file, "UUID,Timestamp,EventType,Details")?;

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

    let import_tx = tx.clone();
    tokio::spawn(async move {
        let mut interval = time::interval(Duration::minutes(1).to_std().unwrap());
        loop {
            interval.tick().await;
            import_tx.send(Message::ImportAndReset).unwrap();
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
            Ok(Message::ImportAndReset) => {
                import_csv_to_mysql(file_path).await?;
                reset_file(&mut log_file)?;
                println!("Imported CSV to MySQL and reset file");
            }
            Err(_) => break,
        }
    }

    Ok(())
}
