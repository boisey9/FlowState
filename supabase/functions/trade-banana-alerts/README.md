# Trade Banana Alerts

Server-side Telegram alert scanner for Trade Banana.

Required Supabase Edge Function secrets:

```text
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
```

The bot token should be stored only in Supabase Edge Function Secrets, never in GitHub or frontend code.

Current alert table in Supabase:

```text
public.trade_banana_alert_events
```

Alert levels:

- WATCH_LONG
- WATCH_SHORT
- READY_LONG
- READY_SHORT
- DATA_WARNING
