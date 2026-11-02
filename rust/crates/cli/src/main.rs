mod commands;
mod error;

use clap::Parser;
use commands::Cli;

fn main() {
    let cli = Cli::parse();
    if let Err(err) = cli.execute() {
        eprintln!("Error: {}", err);
        std::process::exit(1);
    }
}
