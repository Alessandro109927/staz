import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TelegramNotifier {
  private readonly logger = new Logger(TelegramNotifier.name);

  constructor(private readonly config: ConfigService) {}

  async send(text: string): Promise<void> {
    const token = this.config.get<string>('TELEGRAM_BOT_TOKEN', '').trim();
    const chatId = this.config.get<string>('TELEGRAM_CHAT_ID', '').trim();
    if (!token || !chatId) {
      return;
    }

    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        this.logger.warn(`Telegram ha risposto ${response.status}`);
      }
    } catch (error) {
      this.logger.warn(error instanceof Error ? error.message : 'Telegram non raggiungibile');
    }
  }
}
