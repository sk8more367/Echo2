import { Client, GuildStorage, Message } from '@yamdbf/core';
import { TextChannel } from 'discord.js';
import cron from 'node-cron';
import { ConfigService } from '../config/config.service';
import { ICronJob } from '../config/interfaces/cron.interface';
import { checkChannelPermissions } from '../middlewares/validate-channel';
import { AppLogger } from '../util/app-logger';

/**
 * Echo Client
 */

export class EchoClient extends Client {
	public config: ConfigService;
	public tasks: Map<string, cron.ScheduledTask> = new Map();
	private logger: AppLogger = new AppLogger('EchoClient');
	private disconnects: number = 0;

	constructor(config: ConfigService) {
		super({
			commandsDir: './dist/commands',
			owner: ['228781414986809344'], // Harmiox,
			pause: true,
			readyText: 'Echo Client Ready',
			token: config.discord.token,
			unknownCommandError: false
		});

		this.config = config;

		this.use((message: Message, args: any[]) => checkChannelPermissions(message, args, this));

		// Bind events to local client methods
		this.on('clientReady', this.onClientReady);
		this.on('ready', this.onReady);
		this.on('warn', this.onWarn);
		this.on('pause', this.onPause);
		this.on('error', this.onError);
		this.on('disconnect', this.onDisconnect);
		this.on('reconnecting', this.onReconnecting);
	}

	public start() {
		this.logger.info(`${this.logger.context} has been started.`);
		
		return super.start();
	}

	private async onClientReady() {
		// Fetch and load saved cron jobs
		this.logger.info('Starting up echo tasks...');
		this.storage.guilds.forEach(async (guildStorage: GuildStorage) => {
			const jobs: ICronJob[] = (await guildStorage.get('jobs')) || [];
			jobs.forEach((job: ICronJob) => {
				// Validation
				const textChannel: TextChannel = this.channels.get(job.textChannelId) as TextChannel;
				if (!job.active) { return; }
				if (!textChannel) { return this.logger.error('TextChannel not found: ' + job.textChannelId); }

				// Setup the task
				const task: cron.ScheduledTask = cron.schedule(job.expression, () => {
					textChannel.send(job.payload).catch((err: Error) => this.logger.error('Error in cron jon: ', err));
				});
				this.tasks.set(job.identifier, task);

				// Start the task
				task.start();
			});
		});
	}

	private async onReady() {
		this.logger.info(`${this.logger.context} is ready (${this.guilds.size} guilds)`);
	}

	private onWarn(info: {}): void {
    this.logger.warn('Discord warning: ', info);
  }

	private async onPause(): Promise<void> {
		// Set the prefix
		await this.setDefaultSetting('prefix', '!');

		// Continue
    this.continue();
	}
	
	private onError(error: Error): void {
		this.logger.error('Client Error', error);
	}

	private onDisconnect(event: CloseEvent): void {
		this.logger.warn(`${this.logger.context} has been disconnected.`);
		this.disconnects += 1;
    this.logger.warn(`[DICONNECT:${event.code}] ${event.reason}`);
    if (event.code === 1000) {
			this.logger.warn('Disconnect with event code 1000. Exiting process...');
			process.exit();
    }
    if (this.disconnects >= 10) {
      this.logger.warn(`${this.disconnects} failed attempts on reconnecting. Exiting process...`);
    }
    this.logger.warn(`[ATTEMPT:${this.disconnects}] Attempting to login again...`);
    this.login(this.token).catch(err => {
			this.logger.info(`[ERROR] Error when attempting to login after disconnect.\n${err}`);
      process.exit();
    });
  }

  private onReconnecting(): void {
    this.logger.warn(`${this.logger.context} is reconnecting.`);
  }

}