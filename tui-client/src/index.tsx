#!/usr/bin/env node
import { render } from 'ink';
import { Command } from 'commander';
import { App } from './App.js';

const program = new Command();

program
  .name('thesis-tui')
  .description('Terminal UI for Thesis Validator')
  .version('1.0.0')
  .option('-s, --server <url>', 'API server URL', 'http://localhost:3000')
  .option('-t, --token <token>', 'JWT authentication token (or set AUTH_TOKEN env var)')
  .parse();

const options = program.opts<{ server: string; token?: string }>();
const authToken = options.token || process.env['AUTH_TOKEN'];

render(<App serverUrl={options.server} authToken={authToken} />);
