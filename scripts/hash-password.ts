import bcrypt from "bcryptjs";
import readline from "readline";

async function main() {
  const password = process.argv[2];

  if (password) {
    const hash = await bcrypt.hash(password, 10);
    console.log(`Password: ${password}`);
    console.log(`Bcrypt Hash: ${hash}`);
    return;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.question("Enter password to hash: ", async (input) => {
    if (!input.trim()) {
      console.log("Password cannot be empty.");
      process.exit(1);
    }
    const hash = await bcrypt.hash(input.trim(), 10);
    console.log(`\nPassword: ${input.trim()}`);
    console.log(`Bcrypt Hash: ${hash}\n`);
    console.log(`Copy this hash into your .env file as APP_PASSWORD_HASH:`);
    console.log(`APP_PASSWORD_HASH=${hash}`);
    rl.close();
  });
}

main().catch(console.error);
