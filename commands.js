import { ChannelType } from "discord.js";

const commands = [
  {
    name: "ai-respond-to-all",
    description:
      "Enables the bot to always respond to all messages in this channel.",
  },
  {
    name: "ai-wack",
    description: "Clears the conversation history.",
  },
  {
    name: "ai-blacklist",
    description: "Blacklists a user from using certain interactions",
    options: [
      {
        type: 6,
        name: "user",
        description: "The user to blacklist",
        required: true,
      },
    ],
  },
  {
    name: "ai-whitelist",
    description: "Removes a user from the blacklist",
    options: [
      {
        type: 6,
        name: "user",
        description: "The user to whitelist",
        required: true,
      },
    ],
  },
  {
    name: "status",
    description: "Displays bot CPU and RAM usage in detail.",
  },
];

commands.push({
  name: "purge",
  description: "Delete a specified number of messages from the channel.",
  options: [
    {
      type: 4, // Integer
      name: "amount",
      description: "Number of messages to delete (max 100).",
      required: true,
      min_value: 1,
      max_value: 100,
    },
    {
      type: 3, // String
      name: "filter",
      description: "Apply a specific filter to the purge.",
      required: false,
      choices: [
        { name: "Bots only", value: "bots" },
        { name: "Humans only", value: "humans" },
        { name: "Contains links", value: "links" },
        { name: "Contains invites", value: "invites" },
      ],
    },
    {
      type: 6, // User
      name: "user",
      description: "Only delete messages from this user.",
      required: false,
    },
  ],
});

// Add these to your commands array
commands.push({
  name: "level-settings",
  description: "Set XP gain range and cooldown",
  options: [
    {
      name: "min",
      description: "Minimum XP gain",
      type: 4,
      required: false,
    },
    {
      name: "max",
      description: "Maximum XP gain",
      type: 4,
      required: false,
    },
    {
      name: "delay",
      description: "Delay between XP gains in seconds",
      type: 4,
      required: false,
    },
  ],
});

commands.push({
  name: "level-announcement",
  description: "Set the channel where level-up announcements will be sent",
  options: [
    {
      name: "channel",
      description: "The channel to send level-up messages",
      type: 7, // 7 = CHANNEL
      required: true,
      channel_types: [0],
    },
  ],
});

commands.push({
  name: "ai-channel",
  description:
    "Set the one and only channel where the bot is allowed to respond",
  options: [
    {
      name: "channel",
      description: "The text channel the bot is allowed to respond in",
      type: 7, // CHANNEL
      required: true,
      channel_types: [0], // 0 = GUILD_TEXT
    },
  ],
});

commands.push({
  name: "level",
  description: "Check your rank or someone else's",
  options: [
    {
      name: "user",
      type: 6, // USER
      description: "The user whose rank you want to see",
      required: false,
    },
  ],
});

commands.push({
  name: "bday",
  description: "Manage user birthdays.",
  options: [
    {
      type: 1, // Subcommand: add
      name: "add",
      description: "Add or update a user's birthday.",
      options: [
        {
          type: 6, // USER
          name: "user",
          description: "The user to set the birthday for.",
          required: true,
        },
        {
          type: 4, // INTEGER
          name: "month",
          description: "Birthday month (1–12).",
          required: true,
          min_value: 1,
          max_value: 12,
        },
        {
          type: 4, // INTEGER
          name: "day",
          description: "Birthday day (1–31).",
          required: true,
          min_value: 1,
          max_value: 31,
        },
      ],
    },
    {
      type: 1, // Subcommand: remove
      name: "remove",
      description: "Remove a user's birthday.",
      options: [
        {
          type: 6,
          name: "user",
          description: "The user to remove.",
          required: true,
        },
      ],
    },
    {
      type: 1,
      name: "list",
      description: "Show the current birthday list.",
    },
    {
      type: 1,
      name: "reset",
      description: "Reset all birthdays in this server.",
    },
  ],
});

commands.push({
  name: "autoreact-forum",
  description: "Automatically react to new forum posts",
  options: [
    {
      name: "channel",
      type: 7, // CHANNEL
      channel_types: [ChannelType.GuildForum],
      description: "Forum channel to enable auto reactions",
      required: true,
    },
    {
      name: "emotes",
      type: 3, // STRING
      description: "Space-separated emoji list (must be in server)",
      required: true,
    },
  ],
});

commands.push({
  name: "say-embed",
  description: "Send a custom embed to a selected channel",
  options: [
    {
      type: 7, // CHANNEL
      name: "channel",
      description: "Channel to send the embed to",
      required: true,
    },
    {
      type: 3,
      name: "title",
      description: "Embed title",
      required: true,
    },
    {
      type: 3,
      name: "description",
      description: "Embed description",
      required: false,
    },
    {
      type: 3,
      name: "color",
      description: "Embed color (hex or name, e.g. #00ff00 or RED)",
      required: false,
    },
    {
      type: 3,
      name: "url",
      description: "URL to link to the title",
      required: false,
    },
    {
      type: 3,
      name: "author",
      description: "Author name",
      required: false,
    },
    {
      type: 3,
      name: "author_icon",
      description: "Author icon URL",
      required: false,
    },
    {
      type: 3,
      name: "thumbnail",
      description: "Thumbnail image URL",
      required: false,
    },
    {
      type: 3,
      name: "image",
      description: "Main image URL",
      required: false,
    },
    {
      type: 3,
      name: "footer",
      description: "Footer text",
      required: false,
    },
    {
      type: 3,
      name: "footer_icon",
      description: "Footer icon URL",
      required: false,
    },
    {
      type: 5,
      name: "timestamp",
      description: "Add a timestamp to the embed",
      required: false,
    },
    {
      type: 3,
      name: "fields",
      description:
        'JSON array of fields: [{"name":"","value":"","inline":true}]',
      required: false,
    },
  ],
});

commands.push({
  name: "custom-bio",
  description: "Update the bot's bio (Admin only).",
  options: [
    {
      type: 3, // STRING
      name: "bio",
      description: "The new bio to set for the bot.",
      required: true,
    },
  ],
});

commands.push({
  name: "say",
  description: "Send a message (with optional images) to a specified channel.",
  options: [
    {
      type: 7, // CHANNEL
      name: "channel",
      description: "The channel to send the message in.",
      required: true,
    },
    {
      type: 3, // STRING
      name: "message",
      description: "The message content to send.",
      required: false,
    },
    // Support up to 5 optional image attachments
    ...[1, 2, 3, 4, 5].map((i) => ({
      type: 11, // ATTACHMENT
      name: `image${i}`,
      description: `Optional image attachment #${i}`,
      required: false,
    })),
  ],
});

commands.push({
  name: "react-message",
  description: "React to a message in the current channel by its ID.",
  options: [
    {
      type: 3, // STRING
      name: "message_id",
      description: "The ID of the message to react to.",
      required: true,
    },
    {
      type: 3, // STRING
      name: "emoji",
      description: "Space-separated list of emojis to react with.",
      required: true,
    },
  ],
});

// /custom-name
commands.push({
  name: "custom-name",
  description: "Change the bot's username.",
  options: [
    {
      name: "name",
      description: "New bot name",
      type: 3, // STRING
      required: true,
    },
  ],
});

// /custom-avatar
commands.push({
  name: "custom-avatar",
  description: "Change the bot's avatar.",
  options: [
    {
      name: "url",
      description: "Link to new avatar image",
      type: 3, // STRING
      required: false,
    },
    {
      name: "image",
      description: "Upload an image to use as the avatar",
      type: 11, // ATTACHMENT
      required: false,
    },
  ],
});

// /custom-status
commands.push({
  name: "custom-status",
  description: "Set bot's status and activity.",
  options: [
    {
      name: "status",
      description: "online | idle | dnd | invisible",
      type: 3, // STRING
      required: true,
      choices: [
        { name: "Online", value: "online" },
        { name: "Idle", value: "idle" },
        { name: "Do Not Disturb", value: "dnd" },
        { name: "Invisible", value: "invisible" },
      ],
    },
    {
      name: "activity_type",
      description: "playing | watching | listening | competing",
      type: 3, // STRING
      required: true,
      choices: [
        { name: "Playing", value: "playing" },
        { name: "Watching", value: "watching" },
        { name: "Listening", value: "listening" },
        { name: "Competing", value: "competing" },
      ],
    },
    {
      name: "activity_text",
      description: "What should the bot display?",
      type: 3, // STRING
      required: true,
    },
  ],
});

export { commands };
