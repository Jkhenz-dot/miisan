import dotenv from "dotenv";
dotenv.config();
import {
  Client,
  GatewayIntentBits,
  Partials,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionsBitField,
  EmbedBuilder,
  ActivityType,
  ComponentType,
  AttachmentBuilder,
  REST,
  Routes,
} from "discord.js";
import {
  GoogleGenerativeAI,
  HarmBlockThreshold,
  HarmCategory,
} from "@google/generative-ai";
import { GoogleAIFileManager, FileState } from "@google/generative-ai/server";
import { writeFile, unlink } from "fs/promises";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getTextExtractor } from "office-text-extractor";
import osu from "node-os-utils";
const { mem, cpu } = osu;
import axios from "axios";
import canvacord from "canvacord";
const { RankCardBuilder, Font } = canvacord;

await Font.loadDefault();

import config from "./config.js";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Channel],
});

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const fileManager = new GoogleAIFileManager(process.env.GOOGLE_API_KEY);
const token = process.env.DISCORD_BOT_TOKEN;
const activeRequests = new Set();

// Define your objects
let chatHistories = {};
let activeUsersInChannels = {};

let serverSettings = {};
let userResponsePreference = {};
let alwaysRespondChannels = {};
let channelWideChatHistory = {};
let blacklistedUsers = {};
let birthdays = {};
let autoReactSettings = {}; // guildId => { channelId: [emojiIds] }
let xpData = {}; // Stores XP and levels per user per guild
let xpSettings = {}; // Stores per-guild settings: minXP, maxXP, delay
let levelUpChannels = {};
let aiRespondChannel = null;
let bioDescription = "";
let botPresence = {
  status: "online",
  activityType: "Playing",
  activityText: "with code",
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_DIR = path.join(__dirname, "config");
const CHAT_HISTORIES_DIR = path.join(CONFIG_DIR, "chat_histories_3");

const FILE_PATHS = {
  aiRespondChannel: path.join(CONFIG_DIR, "ai_respond_channel.json"),
  levelUpChannels: path.join(CONFIG_DIR, "level_up_channels.json"),
  autoReactSettings: path.join(CONFIG_DIR, "auto_react_settings.json"),
  xpData: path.join(CONFIG_DIR, "xp_data.json"),
  xpSettings: path.join(CONFIG_DIR, "xp_settings.json"),
  birthdays: path.join(CONFIG_DIR, "birthdays.json"),
  activeUsersInChannels: path.join(CONFIG_DIR, "active_users_in_channels.json"),
  serverSettings: path.join(CONFIG_DIR, "server_settings.json"),
  bioDescription: path.join(CONFIG_DIR, "bio_description.json"),
  botPresence: path.join(CONFIG_DIR, "bot_presence.json"),

  userResponsePreference: path.join(
    CONFIG_DIR,
    "user_response_preference.json",
  ),
  alwaysRespondChannels: path.join(CONFIG_DIR, "always_respond_channels.json"),
  channelWideChatHistory: path.join(CONFIG_DIR, "channel_wide_chatistory.json"),
  blacklistedUsers: path.join(CONFIG_DIR, "blacklisted_users.json"),
};

function saveStateToFile() {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }

    if (!fs.existsSync(CHAT_HISTORIES_DIR)) {
      fs.mkdirSync(CHAT_HISTORIES_DIR, { recursive: true });
    }

    for (let [key, value] of Object.entries(chatHistories)) {
      fs.writeFileSync(
        path.join(CHAT_HISTORIES_DIR, `${key}.json`),
        JSON.stringify(value, null, 2),
        "utf-8",
      );
    }

    for (let [key, value] of Object.entries(FILE_PATHS)) {
      fs.writeFileSync(value, JSON.stringify(eval(key), null, 2), "utf-8");
    }
  } catch (error) {
    console.error("Error saving state to files:", error);
  }
}

function loadStateFromFile() {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      console.warn(
        "Config directory does not exist. Initializing with empty state.",
      );
      return;
    }

    if (!fs.existsSync(CHAT_HISTORIES_DIR)) {
      fs.mkdirSync(CHAT_HISTORIES_DIR, { recursive: true });
    } else {
      fs.readdirSync(CHAT_HISTORIES_DIR).forEach((file) => {
        if (file.endsWith(".json")) {
          const user = path.basename(file, ".json");
          try {
            const data = fs.readFileSync(
              path.join(CHAT_HISTORIES_DIR, file),
              "utf-8",
            );
            chatHistories[user] = JSON.parse(data);
          } catch (readError) {
            console.error(`Error reading chat history for ${user}:`, readError);
          }
        }
      });
    }

    for (let [key, value] of Object.entries(FILE_PATHS)) {
      if (fs.existsSync(value)) {
        try {
          const data = fs.readFileSync(value, "utf-8");
          eval(`${key} = JSON.parse(data)`);
        } catch (readError) {
          console.error(`Error reading ${key}:`, readError);
        }
      }
    }
  } catch (error) {
    console.error("Error loading state from files:", error);
  }
}

function removeFileData(chatHistories) {
  try {
    Object.values(chatHistories).forEach((subIdEntries) => {
      subIdEntries.forEach((message) => {
        if (message.content) {
          message.content = message.content.filter((contentItem) => {
            if (contentItem.fileData) {
              delete contentItem.fileData;
            }
            return Object.keys(contentItem).length > 0;
          });
        }
      });
    });
    console.log("fileData elements have been removed from chat histories.");
  } catch (error) {
    console.error("An error occurred while removing fileData elements:", error);
  }
}

function scheduleDailyReset() {
  try {
    const now = new Date();
    const nextReset = new Date();
    nextReset.setHours(0, 0, 0, 0);
    if (nextReset <= now) {
      nextReset.setDate(now.getDate() + 1);
    }
    const timeUntilNextReset = nextReset - now;

    setTimeout(() => {
      removeFileData(chatHistories);
      scheduleDailyReset();
    }, timeUntilNextReset);
  } catch (error) {
    console.error("An error occurred while scheduling the daily reset:", error);
  }
}

scheduleDailyReset();
loadStateFromFile();

// <=====[Configuration]=====>

const MODEL = "gemini-2.0-flash";

const safetySettings = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_NONE,
  },
];

const generationConfig = {
  temperature: 1.0,
};

const defaultResponseFormat = config.defaultResponseFormat;

const hexColour = config.hexColour;
const defaultPersonality = config.defaultPersonality;
const defaultServerSettings = config.defaultServerSettings;

const shouldDisplayPersonalityButtons = config.shouldDisplayPersonalityButtons;
const SEND_RETRY_ERRORS_TO_DISCORD = config.SEND_RETRY_ERRORS_TO_DISCORD;

import {
  function_declarations,
  manageToolCall,
  processFunctionCallsNames,
} from "./tools/function_calling.js";

import { delay, retryOperation, filterPrompt } from "./tools/others.js";

// <==========>

// <=====[Register Commands And Activities]=====>

import { commands } from "./commands.js";

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}!`);

  const rest = new REST({ version: "10" }).setToken(token);
  try {
    console.log("Started refreshing application (/) commands.");

    await rest.put(Routes.applicationCommands(client.user.id), {
      body: commands,
    });

    console.log("Successfully reloaded application (/) commands.");
  } catch (error) {
    console.error(error);
  }

  if (botPresence?.activityText) {
    client.user.setPresence({
      status: botPresence.status || "online",
      activities: [
        {
          name: botPresence.activityText,
          type:
            ActivityType[
              (botPresence.activityType || "Playing").toUpperCase()
            ] || ActivityType.Playing,
        },
      ],
    });
  }
});

// <==========>

// <=====[Messages And Interaction]=====>
const allowedGuilds = ["1228329411833499649", "1206274128588578826"];

client.on("messageCreate", async (message) => {
  if (!message.guildId || !allowedGuilds.includes(message.guildId)) {
    return;
  }

  try {
    if (message.author.bot) return;
    if (message.content.startsWith("!")) return;

    await handleXP(message);
    const isDM = message.channel.type === ChannelType.DM;
    const mentionPattern = new RegExp(
      `^<@!?${client.user.id}>(?:\\s+)?(generate|imagine)`,
      "i",
    );
    const startsWithPattern = /^generate|^imagine/i;
    const command =
      message.content.match(mentionPattern) ||
      message.content.match(startsWithPattern);

    if (!isDM && message.channelId !== aiRespondChannel) {
      return;
    }

    const shouldRespond =
      alwaysRespondChannels[message.channelId] ||
      (message.mentions.users.has(client.user.id) && !isDM) ||
      activeUsersInChannels[message.channelId]?.[message.author.id];

    if (shouldRespond) {
      if (message.guild) {
        initializeBlacklistForGuild(message.guild.id);
        if (blacklistedUsers[message.guild.id].includes(message.author.id)) {
          const embed = new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle("Blacklisted")
            .setDescription("You are blacklisted and cannot use this bot.");
          return message.reply({ embeds: [embed] });
        }
      }
      if (command) {
        const prompt = message.content
          .slice(command.index + command[0].length)
          .trim();
        if (prompt) {
          await genimg(prompt, message);
        } else {
          const embed = new EmbedBuilder()
            .setColor(0x00ffff)
            .setTitle("Invalid Prompt")
            .setDescription("Please provide a valid prompt.");
          await message.channel.send({ embeds: [embed] });
        }
      } else if (activeRequests.has(message.author.id)) {
        const embed = new EmbedBuilder()
          .setColor(0xffff00)
          .setTitle("Request In Progress")
          .setDescription(
            "Please wait until your previous action is complete.",
          );
        await message.reply({ embeds: [embed] });
      } else {
        await handleTextMessage(message);
      }
    }
  } catch (error) {
    console.error("Error processing the message:", error);
    if (activeRequests.has(message.author.id)) {
      activeRequests.delete(message.author.id);
    }
  }
});

client.on("interactionCreate", async (interaction) => {
  try {
    if (
      (!interaction.guildId || !allowedGuilds.includes(interaction.guildId)) &&
      (interaction.isCommand() ||
        interaction.isMessageComponent() ||
        interaction.isModalSubmit() ||
        interaction.isStringSelectMenu())
    ) {
      const embed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle("Not Allowed")
        .setDescription("You cannot use this bot outside authorized servers.");

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ embeds: [embed], ephemeral: true });
      } else {
        await interaction.reply({ embeds: [embed], ephemeral: true });
      }
      return;
    }

    if (
      aiRespondChannel &&
      interaction.channelId !== aiRespondChannel &&
      !interaction.memberPermissions.has("Administrator")
    ) {
      const embed = new EmbedBuilder()
        .setColor(0xff5555)
        .setTitle("Wrong Channel")
        .setDescription(
          `You can only use this bot in <#${aiRespondChannel}>. Please use the correct channel.`,
        );

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ embeds: [embed], ephemeral: true });
      } else {
        await interaction.reply({ embeds: [embed], ephemeral: true });
      }
      return;
    }

    if (
      aiRespondChannel &&
      interaction.channelId !== aiRespondChannel &&
      interaction.memberPermissions.has("Administrator") &&
      interaction.isCommand() &&
      !["ai-channel", "purge"].includes(interaction.commandName)
    ) {
      const embed = new EmbedBuilder()
        .setColor(0xff5555)
        .setTitle("Wrong Channel")
        .setDescription(
          `You can only use this bot in <#${aiRespondChannel}>. Please use the correct channel.`,
        );

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ embeds: [embed], ephemeral: true });
      } else {
        await interaction.reply({ embeds: [embed], ephemeral: true });
      }
      return;
    }

    if (interaction.isCommand()) {
      await handleCommandInteraction(interaction);
    } else if (interaction.isButton()) {
      await handleButtonInteraction(interaction);
    } else if (interaction.isModalSubmit()) {
      await handleModalSubmit(interaction);
    } else if (interaction.isStringSelectMenu()) {
      await handleSelectMenuInteraction(interaction);
    }
  } catch (error) {
    console.error("Error handling interaction:", error.message);
  }
});

async function handleCommandInteraction(interaction) {
  if (!interaction.isCommand()) return;

  const commandHandlers = {
    "ai-respond-to-all": handleRespondToAllCommand,
    "ai-channel": handleAIChannelCommand,
    "ai-whitelist": handleWhitelistCommand,
    "ai-blacklist": handleBlacklistCommand,

    "ai-wack": handleClearMemoryCommand,

    status: handleStatusCommand,
    purge: handlePurgeCommand,
    bday: handleBdayCommand,
    "autoreact-forum": handleAutoReactCommand,
    "level-announcement": handleLevelChannel, // <-- Add this line
    "level-settings": handleXPSettings,
    level: handleRank,
    say: handleSayCommand,
    "react-message": handleReactMessageCommand,
    "custom-name": handleCustomName,
    "custom-bio": handleCustomBio,
    "custom-avatar": handleCustomAvatar,
    "custom-status": handleCustomStatus,
    "say-embed": handleSayEmbed,
  };

  const handler = commandHandlers[interaction.commandName];
  if (handler) {
    await handler(interaction);
  } else {
    console.log(`Unknown command: ${interaction.commandName}`);
  }
}

async function handleButtonInteraction(interaction) {
  if (!interaction.isButton()) return;

  if (interaction.guild) {
    initializeBlacklistForGuild(interaction.guild.id);
    if (blacklistedUsers[interaction.guild.id].includes(interaction.user.id)) {
      const embed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle("Blacklisted")
        .setDescription("You are blacklisted and cannot use this interaction.");
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }

  const buttonHandlers = {
    "server-chat-history": toggleServerWideChatHistory,
    "clear-server": clearServerChatHistory,
    "response-server-mode": toggleServerPreference,
    "toggle-response-server-mode": toggleServerResponsePreference,

    "clear-memory": handleClearMemoryCommand,
    "always-respond": alwaysRespond,

    "toggle-response-mode": handleToggleResponseMode,
  };

  for (const [key, handler] of Object.entries(buttonHandlers)) {
    if (interaction.customId.startsWith(key)) {
      if (key === "select-speech-model-") {
        const selectedModel = interaction.customId.replace(
          "select-speech-model-",
          "",
        );
        await handleSpeechSelectModel(interaction, selectedModel);
      } else {
        await handler(interaction);
      }
      return;
    }
  }

  if (interaction.customId.startsWith("delete_message-")) {
    const msgId = interaction.customId.replace("delete_message-", "");
    await handleDeleteMessageInteraction(interaction, msgId);
  }
}

async function handleDeleteMessageInteraction(interaction, msgId) {
  const userId = interaction.user.id;
  const userChatHistory = chatHistories[userId];
  const channel = interaction.channel;
  const message = channel
    ? await channel.messages.fetch(msgId).catch(() => false)
    : false;

  if (userChatHistory) {
    if (userChatHistory[msgId]) {
      delete userChatHistory[msgId];
      await deleteMsg();
    } else {
      try {
        const replyingTo = message
          ? message.reference
            ? (
                await message.channel.messages.fetch(
                  message.reference.messageId,
                )
              ).author.id
            : 0
          : 0;
        if (userId === replyingTo) {
          await deleteMsg();
        } else {
          const embed = new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle("Not For You")
            .setDescription("This button is not meant for you.");
          return interaction.reply({ embeds: [embed], ephemeral: true });
        }
      } catch (error) {}
    }
  }

  async function deleteMsg() {
    await interaction.message
      .delete()
      .catch("Error deleting interaction message: ", console.error);

    if (channel) {
      if (message) {
        message.delete().catch(() => {});
      }
    }
  }
}

async function handleSelectMenuInteraction(interaction) {
  if (!interaction.isStringSelectMenu()) return;

  const selectMenuHandlers = {
    "select-image-model": handleImageSelectModel,
    "select-image-resolution": handleImageSelectResolution,
  };

  const handler = selectMenuHandlers[interaction.customId];
  if (handler) {
    const selectedValue = interaction.values[0];
    await handler(interaction, selectedValue);
  }
}

async function handleClearMemoryCommand(interaction) {
  const serverChatHistoryEnabled = interaction.guild
    ? serverSettings[interaction.guild.id]?.serverChatHistory
    : false;
  if (!serverChatHistoryEnabled) {
    await clearChatHistory(interaction);
  } else {
    const embed = new EmbedBuilder()
      .setColor(0xff5555)
      .setTitle("Feature Disabled")
      .setDescription(
        "Clearing chat history is not enabled for this server, Server-Wide chat history is active.",
      );
    await interaction.reply({ embeds: [embed] });
  }
}

async function handleToggleResponseMode(interaction) {
  const serverResponsePreferenceEnabled = interaction.guild
    ? serverSettings[interaction.guild.id]?.serverResponsePreference
    : false;
  if (!serverResponsePreferenceEnabled) {
    await toggleUserResponsePreference(interaction);
  } else {
    const embed = new EmbedBuilder()
      .setColor(0xff5555)
      .setTitle("Feature Disabled")
      .setDescription(
        "Toggling Response Mode is not enabled for this server, Server-Wide Response Mode is active.",
      );
    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
}

// <=====[Messages Handling]=====>

async function handleTextMessage(message) {
  const botId = client.user.id;
  const userId = message.author.id;
  const guildId = message.guild?.id;
  const channelId = message.channel.id;

  let messageContent = message.content
    .replace(new RegExp(`<@!?${botId}>`), "")
    .trim();

  if (
    messageContent === "" &&
    !(message.attachments.size > 0 && hasSupportedAttachments(message))
  ) {
    return; // skip empty messages with no valid attachments
  }

  message.channel.sendTyping();
  const typingInterval = setInterval(() => {
    message.channel.sendTyping();
  }, 4000);
  setTimeout(() => {
    clearInterval(typingInterval);
  }, 120000);

  let botMessage = null;
  let parts;

  try {
    messageContent = await extractFileText(message, messageContent);
    parts = await processPromptAndMediaAttachments(messageContent, message);
  } catch (error) {
    clearInterval(typingInterval);
    console.error("Error processing message:", error);

    const errorEmbed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle("Error")
      .setDescription("Something went wrong while processing your message.");
    await message.reply({ embeds: [errorEmbed] });
    return;
  }

  // Build infoStr with only context (no instruction rules)
  let infoStr = "";
  if (message.guild) {
    const guild = message.guild;
    const member = await guild.members.fetch(message.author.id);

    const userInfo = {
      username: message.author.username,
      displayName: message.member?.displayName || message.author.username,
      id: message.author.id,
      createdAt: message.author.createdAt.toDateString(),
      joinedAt: member.joinedAt?.toDateString() || "Unknown",
      nickname: member.nickname || message.member?.displayName,
      roles:
        member.roles.cache
          .filter((r) => r.id !== guild.id)
          .map((r) => r.name)
          .join(", ") || "None",
      highestRole: member.roles.highest.name,
      isBot: message.author.bot,
      voiceChannel: member.voice?.channel
        ? `${member.voice.channel.name} (ID: ${member.voice.channel.id})`
        : "Not Connected",
      presenceStatus: member.presence?.status || "offline",
    };

    const emojis = guild.emojis.cache;
    const emojiStrings = emojis.map((e) =>
      e.animated ? `<a:${e.name}:${e.id}>` : `<:${e.name}:${e.id}>`,
    );

    const guildInfo = {
      name: guild.name,
      id: guild.id,
      createdAt: guild.createdAt.toDateString(),
      memberCount: guild.memberCount,
      roleCount: guild.roles.cache.size,
      emojiCount: emojis.size,
      animatedEmojiCount: emojis.filter((e) => e.animated).size,
      staticEmojiCount: emojis.filter((e) => !e.animated).size,
      boostLevel: guild.premiumTier,
      boostCount: guild.premiumSubscriptionCount,
      verificationLevel: guild.verificationLevel,
      nsfwLevel: guild.nsfwLevel,
      locale: guild.preferredLocale,
    };

    const emojiDisplay = emojiStrings.join(" ");
    const channelInfo = {
      name: message.channel.name,
      id: message.channel.id,
      type: message.channel.type,
      isNSFW: message.channel.nsfw,
    };

    infoStr = `

    Your name is ${client.user.username}.

You must always address ${userInfo.username} as ${userInfo.nickname}.
You are a roleplayer. Always reply with 2 to 3 normal sentences and 1 to 2 *roleplay sentence*.
Add "\n" to separate normal and *roleplay sentences*.
Use Discord server emojis when expressing emotions or reactions, and format them like <emoji_name:emoji_id> or <a:emoji_name:emoji_id> (for animated).

Do not use Unicode emojis or :emoji_name: format. Only use the exact formats provided below.

## Server Emojis
${emojiDisplay}


You are in the **${guildInfo.name}** Discord server.

## Server Information
- Name: ${guildInfo.name}
- ID: ${guildInfo.id}
- Created At: ${guildInfo.createdAt}
- Members: ${guildInfo.memberCount}
- Roles: ${guildInfo.roleCount}
- Emojis: ${guildInfo.emojiCount} (Animated: ${guildInfo.animatedEmojiCount}, Static: ${guildInfo.staticEmojiCount})
- Boost Level: ${guildInfo.boostLevel} (${guildInfo.boostCount} boosts)
- NSFW Level: ${guildInfo.nsfwLevel}
- Verification Level: ${guildInfo.verificationLevel}
- Locale: ${guildInfo.locale}

## User Information
- Username: ${userInfo.username}
- ID: ${userInfo.id}
- Display Name: ${userInfo.displayName}
- Nickname: ${userInfo.nickname}
- Joined Server: ${userInfo.joinedAt}
- Account Created: ${userInfo.createdAt}
- Roles: ${userInfo.roles}
- Highest Role: ${userInfo.highestRole}
- Voice Channel: ${userInfo.voiceChannel}
- Presence Status: ${userInfo.presenceStatus}
- Bot: ${userInfo.isBot ? "Yes" : "No"}

## Channel Information
- Channel Name: ${channelInfo.name}
- Channel ID: ${channelInfo.id}
- Type: ${channelInfo.type}
- NSFW: ${channelInfo.isNSFW ? "Yes" : "No"}
`.trim();
  }

  const isServerChatHistoryEnabled = guildId
    ? serverSettings[guildId]?.serverChatHistory
    : false;

  const isChannelChatHistoryEnabled = guildId
    ? channelWideChatHistory[channelId]
    : false;

  const historyId = isChannelChatHistoryEnabled
    ? isServerChatHistoryEnabled
      ? guildId
      : channelId
    : userId;

  const model = await genAI.getGenerativeModel({
    model: MODEL,
    systemInstruction: {
      role: "system",
      parts: [{ text: infoStr }],
    },
    generationConfig,
    tools: { functionDeclarations: function_declarations },
  });

  const chat = model.startChat({
    history: getHistory(historyId),
    safetySettings,
  });

  await handleModelResponse(
    botMessage,
    chat,
    parts,
    message,
    typingInterval,
    historyId,
  );
}

function hasSupportedAttachments(message) {
  const supportedFileExtensions = [
    ".html",
    ".js",
    ".css",
    ".json",
    ".xml",
    ".csv",
    ".py",
    ".java",
    ".sql",
    ".log",
    ".md",
    ".txt",
    ".pdf",
    ".docx",
  ];

  return message.attachments.some((attachment) => {
    const contentType = (attachment.contentType || "").toLowerCase();
    const fileExtension = path.extname(attachment.name) || "";
    return (
      (contentType.startsWith("image/") && contentType !== "image/gif") ||
      contentType.startsWith("audio/") ||
      contentType.startsWith("video/") ||
      supportedFileExtensions.includes(fileExtension)
    );
  });
}

async function downloadFile(url, filePath) {
  const writer = fs.createWriteStream(filePath);
  const response = await axios({
    url,
    method: "GET",
    responseType: "stream",
  });
  response.data.pipe(writer);
  return new Promise((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error", reject);
  });
}

function sanitizeFileName(fileName) {
  return fileName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-") // replace non-lowercase alphanumeric and dashes with dashes
    .replace(/^-+|-+$/g, ""); // remove leading and trailing dashes
}

async function processPromptAndMediaAttachments(prompt, message) {
  const attachments = JSON.parse(
    JSON.stringify(Array.from(message.attachments.values())),
  );

  let parts = [{ text: prompt }];

  if (attachments.length > 0) {
    const validAttachments = attachments.filter((attachment) => {
      const contentType = attachment.contentType.toLowerCase();
      return (
        (contentType.startsWith("image/") && contentType !== "image/gif") ||
        contentType.startsWith("audio/") ||
        contentType.startsWith("video/")
      );
    });

    if (validAttachments.length > 0) {
      const attachmentParts = await Promise.all(
        validAttachments.map(async (attachment) => {
          const sanitizedFileName = sanitizeFileName(attachment.name);
          const filePath = path.join(__dirname, sanitizedFileName);

          try {
            // Download the file
            await downloadFile(attachment.url, filePath);

            // Upload the downloaded file
            const uploadResult = await fileManager.uploadFile(filePath, {
              mimeType: attachment.contentType,
              displayName: sanitizedFileName,
            });
            const name = uploadResult.file.name;
            if (name === null) {
              throw new Error(
                `Unable to extract file name from upload result: ${nameField}`,
              );
            }

            // Check if the file is a video and wait for its state to be 'ACTIVE'
            if (attachment.contentType.startsWith("video/")) {
              let file = await fileManager.getFile(name);
              while (file.state === FileState.PROCESSING) {
                process.stdout.write(".");
                await new Promise((resolve) => setTimeout(resolve, 10_000));
                file = await fileManager.getFile(name);
              }

              if (file.state === FileState.FAILED) {
                throw new Error(
                  `Video processing failed for ${sanitizedFileName}.`,
                );
              }
            }

            // Delete the local file
            fs.unlinkSync(filePath);

            return {
              fileData: {
                mimeType: attachment.contentType,
                fileUri: uploadResult.file.uri,
              },
            };
          } catch (error) {
            console.error(
              `Error processing attachment ${sanitizedFileName}:`,
              error,
            );
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }
            return null;
          }
        }),
      );

      parts = [...parts, ...attachmentParts.filter((part) => part !== null)];
    }
  }

  return parts;
}

async function extractFileText(message, messageContent) {
  if (message.attachments.size > 0) {
    let attachments = Array.from(message.attachments.values());
    for (const attachment of attachments) {
      const fileType = path.extname(attachment.name) || "";
      const fileTypes = [
        ".html",
        ".js",
        ".css",
        ".json",
        ".xml",
        ".csv",
        ".py",
        ".java",
        ".sql",
        ".log",
        ".md",
        ".txt",
        ".pdf",
        ".docx",
      ];

      if (fileTypes.includes(fileType)) {
        try {
          let fileContent = await downloadAndReadFile(attachment.url, fileType);
          messageContent += `\n\n[\`${attachment.name}\` File Content]:\n\`\`\`\n${fileContent}\n\`\`\``;
        } catch (error) {
          console.error(
            `Error reading file ${attachment.name}: ${error.message}`,
          );
        }
      }
    }
  }
  return messageContent;
}

async function downloadAndReadFile(url, fileType) {
  let response = await fetch(url);
  if (!response.ok)
    throw new Error(`Failed to download ${response.statusText}`);

  switch (fileType) {
    case "pdf":
    case "docx":
      let buffer = await response.arrayBuffer();
      const extractor = getTextExtractor();
      return await extractor.extractText({ input: buffer, type: "buffer" });
    default:
      return await response.text();
  }
}

//autoreact
function saveAutoReactSettings() {
  fs.writeFileSync(
    FILE_PATHS.autoReactSettings,
    JSON.stringify(autoReactSettings, null, 2),
  );
}

async function handleReactMessageCommand(interaction) {
  const id = interaction.options.getString("message_id"); // <-- match option name
  const emojiString = interaction.options.getString("emoji");
  const emojis = emojiString.split(/\s+/).filter(Boolean);

  let message;

  try {
    message = await interaction.channel.messages.fetch(id);
  } catch (err) {
    console.error("Fetch error:", err);
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle("Fetch Failed")
          .setDescription("Could not fetch the message using the provided ID."),
      ],
      ephemeral: true,
    });
  }

  const failed = [];
  for (const emoji of emojis) {
    try {
      await message.react(emoji);
    } catch (err) {
      console.warn(`Failed to react with ${emoji}:`, err);
      failed.push(emoji);
    }
  }

  const successCount = emojis.length - failed.length;

  const embed = new EmbedBuilder()
    .setColor(failed.length > 0 ? 0xffa500 : 0x00ff00)
    .setTitle(
      failed.length > 0 ? "⚠️ Some Reactions Failed" : "Reactions Added",
    )
    .setDescription(
      `Added ${successCount} reaction${successCount !== 1 ? "s" : ""} to the message.` +
        (failed.length > 0
          ? `\n\nFailed to react with: ${failed.join(" ")}`
          : "\n\nAll reactions were added successfully!"),
    );

  return interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleAutoReactCommand(interaction) {
  const channel = interaction.options.getChannel("channel");
  const emojis = interaction.options.getString("emotes").split(/\s+/);

  if (channel.type !== ChannelType.GuildForum) {
    const embed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle("Invalid Channel")
      .setDescription("Please select a valid forum channel.");
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // Validate emojis: must exist in this guild
  const validEmojis = emojis.filter((emoji) => {
    const found = interaction.guild.emojis.cache.find(
      (e) => e.toString() === emoji,
    );
    return !!found;
  });

  if (validEmojis.length === 0) {
    const embed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle("No Valid Emojis")
      .setDescription("No valid emojis found in this server.");
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // Save to settings
  if (!autoReactSettings[interaction.guildId])
    autoReactSettings[interaction.guildId] = {};
  autoReactSettings[interaction.guildId][channel.id] = validEmojis;

  saveAutoReactSettings();

  const successEmbed = new EmbedBuilder()
    .setColor(0x00ff00)
    .setTitle("Auto-React Enabled")
    .setDescription(
      `Auto-react enabled for ${channel} with: ${validEmojis.join(" ")}`,
    );
  return interaction.reply({ embeds: [successEmbed], ephemeral: true });
}

client.on("threadCreate", async (thread) => {
  const guildId = thread.guild.id;
  const parentChannelId = thread.parentId;

  if (
    autoReactSettings[guildId] &&
    autoReactSettings[guildId][parentChannelId]
  ) {
    try {
      const messages = await thread.messages.fetch({ limit: 1 });
      const firstMessage = messages.first();

      if (!firstMessage) return;

      for (const emojiId of autoReactSettings[guildId][parentChannelId]) {
        await firstMessage.react(emojiId).catch(console.warn);
      }
    } catch (err) {
      console.error("Failed to auto-react to thread post:", err);
    }
  }
});

//rank

async function handleXPSettings(interaction) {
  const guildId = interaction.guildId;

  if (!interaction.member.permissions.has("Administrator")) {
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("Insufficient Permissions")
          .setColor(0xff0000)
          .setDescription(
            "Only **Administrators** can set and view XP settings.",
          ),
      ],
      ephemeral: true,
    });
  }

  if (!xpSettings[guildId]) {
    xpSettings[guildId] = { xpMin: 10, xpMax: 25, delay: 60000 };
  }

  const current = xpSettings[guildId];
  const min = interaction.options.getInteger("min");
  const max = interaction.options.getInteger("max");
  const delay = interaction.options.getInteger("delay");

  if (min === null && max === null && delay === null) {
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("ℹ️ XP Settings")
          .setColor(0x9999ff)
          .setDescription("You didn't provide any options. Current settings:")
          .addFields(
            { name: "XP Min", value: `${current.xpMin}`, inline: true },
            { name: "XP Max", value: `${current.xpMax}`, inline: true },
            {
              name: "Cooldown",
              value: `${current.delay / 1000}s`,
              inline: true,
            },
          ),
      ],
      ephemeral: true,
    });
  }

  const updated = { ...current };
  if (min !== null) updated.xpMin = min;
  if (max !== null) updated.xpMax = max;
  if (delay !== null) updated.delay = delay * 1000;

  if (updated.xpMin <= 0 || updated.xpMax < updated.xpMin) {
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("Invalid XP Settings")
          .setColor(0xff4444)
          .setDescription(
            `Make sure:\n- XP Min > 0\n- XP Max ≥ XP Min\n\nProvided:\n• XP Min: ${updated.xpMin}\n• XP Max: ${updated.xpMax}`,
          ),
      ],
      ephemeral: true,
    });
  }

  xpSettings[guildId] = updated;
  saveStateToFile();

  return interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle("XP Settings Updated")
        .setColor(0x00ff99)
        .setDescription("XP gain settings successfully updated:")
        .addFields(
          { name: "XP Min", value: `${updated.xpMin}`, inline: true },
          { name: "XP Max", value: `${updated.xpMax}`, inline: true },
          { name: "Cooldown", value: `${updated.delay / 1000}s`, inline: true },
        ),
    ],
    ephemeral: true,
  });
}
// Auto XP per message
async function handleXP(message) {
  if (message.author.bot || !message.guild) return;

  const guildId = message.guild.id;
  const userId = message.author.id;

  // Initialize XP tracking for the server and user
  if (!xpData[guildId]) xpData[guildId] = {};
  if (!xpData[guildId][userId]) {
    xpData[guildId][userId] = { xp: 0, level: 0, lastMessage: 0 };
  }

  // Default XP settings if not set
  if (!xpSettings[guildId]) {
    xpSettings[guildId] = { xpMin: 10, xpMax: 25, delay: 60000 };
  }

  const userXP = xpData[guildId][userId];
  const settings = xpSettings[guildId];
  const now = Date.now();

  // Delay check
  if (now - userXP.lastMessage < settings.delay) return;

  // XP gain
  const xpGain = Math.floor(
    Math.random() * (settings.xpMax - settings.xpMin + 1) + settings.xpMin,
  );
  userXP.xp += xpGain;
  userXP.lastMessage = now;

  const newLevel = Math.floor(0.1 * Math.sqrt(userXP.xp));

  if (newLevel > userXP.level) {
    userXP.level = newLevel;

    // Get level-up channel (fallback to same channel if not set)
    const levelChannelId = levelUpChannels?.[guildId];
    const levelChannel = levelChannelId
      ? message.guild.channels.cache.get(levelChannelId)
      : message.channel;

    if (levelChannel && levelChannel.isTextBased()) {
      await levelChannel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0x00bfff)
            .setTitle("Level Up!")
            .setDescription(`<@${userId}> just reached **Level ${newLevel}**!`)
            .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
            .setTimestamp(),
        ],
        allowedMentions: { users: [userId] }, // ping user only
      });
    }
  }

  saveStateToFile(); // persist updated XP data
}

async function handleRank(interaction) {
  const target = interaction.options.getUser("user") || interaction.user;
  const userId = target.id;
  const guildId = interaction.guildId;

  // Check if user has XP data
  if (!xpData[guildId] || !xpData[guildId][userId]) {
    return interaction.reply({
      content: `${target.username} hasn't earned any XP yet.`,
      ephemeral: true,
    });
  }

  const { xp, level } = xpData[guildId][userId];
  const nextLevelXP = Math.floor(Math.pow((level + 1) / 0.1, 2));
  const currentLevelXP = Math.floor(Math.pow(level / 0.1, 2));

  // Calculate user's rank (based on total XP across users in the guild)
  const sorted = Object.entries(xpData[guildId])
    .sort(([, a], [, b]) => b.xp - a.xp)
    .map(([id]) => id);

  const rankPosition = sorted.indexOf(userId) + 1;

  // Fetch user roles
  const member = await interaction.guild.members.fetch(userId);
  const allowedRoleIds = [
    "1206480988000223305", // STAR
    "1206481447582433291", // DIAMOND
    "1206486307874934784", // MILK
    "1206487990965108788", // WRATH
  ];

  const matchingRoles = member.roles.cache
    .filter((role) => allowedRoleIds.includes(role.id))
    .sort((a, b) => b.position - a.position);

  const primaryRole = matchingRoles.first();

  // Build the rank card
  const card = new RankCardBuilder()
    .setUsername(target.username)
    .setDisplayName(target.globalName || target.username)
    .setAvatar(target.displayAvatarURL({ extension: "png", size: 256 }))
    .setCurrentXP(xp - currentLevelXP)
    .setRequiredXP(nextLevelXP - currentLevelXP)
    .setLevel(level)
    .setRank(rankPosition.toString())
    .setTextStyles({
      level: "LVL:",
      xp: "EXP :",
      rank: (primaryRole?.name || "No") + " Role",
    })
    .setStyles({
      statistics: {
        level: {
          text: {
            style: {
              fontSize: "30px",
              left: "270px",
              position: "absolute",
            },
          },
          value: {
            style: {
              fontSize: "30px",
            },
          },
        },
        rank: {
          text: {
            style: {
              position: "absolute",
              marginLeft: "-60px",
              fontSize: "30px",
            },
          },
          value: {
            style: {
              position: "absolute",
              fontSize: "80px",
              bottom: "80px",
              left: "500px",
            },
          },
        },
        xp: {
          text: {
            style: {
              fontSize: "30px",
              position: "absolute",
              left: "380px",
            },
          },
          value: {
            style: {
              fontSize: "30px",
            },
          },
        },
      },
      username: {
        name: {
          style: {
            fontSize: "55px",
            marginTop: "-10px",
            marginLeft: "10px",
            marginBottom: "50px",
          },
        },
        handle: {
          style: {
            fontSize: "30px",
            marginTop: "-60px",
            marginLeft: "10px",
            marginBottom: "70px",
          },
        },
      },
      progressbar: {
        thumb: {
          style: {
            height: "40px",
            bottom: "20px",
            backgroundColor: primaryRole?.hexColor || "white",
            position: "absolute",
          },
        },
        track: {
          style: {
            height: "40px",
            bottom: "20px",
            position: "absolute",
          },
        },
      },
    });

  const buffer = await card.build({ format: "png" });
  const attachment = new AttachmentBuilder(buffer, { name: "rank.png" });

  return interaction.reply({ files: [attachment] });
}

async function handleLevelChannel(interaction) {
  if (!interaction.member.permissions.has("Administrator")) {
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle("Permission Denied")
          .setDescription("Only server admins can set the level-up channel."),
      ],
      ephemeral: true,
    });
  }

  const channel = interaction.options.getChannel("channel");

  if (!channel.isTextBased()) {
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff9900)
          .setTitle("Invalid Channel")
          .setDescription("Please select a text-based channel."),
      ],
      ephemeral: true,
    });
  }

  levelUpChannels[interaction.guildId] = channel.id;
  saveStateToFile();

  return interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x00cc66)
        .setTitle("Level-Up Channel Set")
        .setDescription(`Level-up messages will be sent in <#${channel.id}>.`),
    ],
    ephemeral: true,
  });
}

//bday

function saveBirthdays() {
  try {
    fs.writeFileSync(
      FILE_PATHS.birthdays,
      JSON.stringify(birthdays, null, 2),
      "utf-8",
    );
  } catch (err) {
    console.error("Failed to save birthdays:", err);
  }
}

// Birthday Command Handler
async function handleBdayCommand(interaction) {
  try {
    if (
      !interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)
    ) {
      const embed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle("Permission Denied")
        .setDescription(
          "You need the **Manage Server** permission to use this command.",
        );
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    const subcommand = interaction.options.getSubcommand();
    const actions = {
      add: handleBdayAdd,
      remove: handleBdayRemove,
      list: handleBdayList,
      reset: handleBdayReset,
    };

    if (actions[subcommand]) {
      return actions[subcommand](interaction);
    }
  } catch (error) {
    console.error("Error in bday command:", error);
    const embed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle("An Error Occurred")
      .setDescription("Something went wrong. Please try again later.");

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ embeds: [embed], ephemeral: true });
    } else {
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }
}

// Subcommand: Add Birthday
async function handleBdayAdd(interaction) {
  const user = interaction.options.getUser("user") || interaction.user;
  const month = interaction.options.getInteger("month");
  const day = interaction.options.getInteger("day");

  const guildId = interaction.guildId;
  if (!birthdayData[guildId]) birthdays[guildId] = {};

  birthdays[guildId][user.id] = { month, day };
  saveBirthdays();

  const embed = new EmbedBuilder()
    .setColor(0x00ff00)
    .setTitle("Birthday Added")
    .setDescription(`Set birthday for <@${user.id}> → **${month}/${day}**`);

  await interaction.reply({ embeds: [embed] });
}

// Subcommand: Remove Birthday
async function handleBdayRemove(interaction) {
  const user = interaction.options.getUser("user");
  const guildId = interaction.guildId;
  const guildBirthdays = birthdays[guildId] || {};
  const embed = new EmbedBuilder();

  if (guildBirthdays[user.id]) {
    delete guildBirthdays[user.id];
    saveBirthdays();

    embed
      .setColor(0x00ff00)
      .setTitle("Birthday Removed")
      .setDescription(`Removed birthday for <@${user.id}>.`);
  } else {
    embed
      .setColor(0xffa500)
      .setTitle("Not Found")
      .setDescription(`<@${user.id}> has no birthday set.`);
  }

  await interaction.reply({ embeds: [embed] });
}

// Subcommand: List Birthdays
async function handleBdayList(interaction) {
  const guildId = interaction.guildId;
  if (!interaction.guild) {
    return interaction.reply({
      content: "This command can only be used in a server.",
      ephemeral: true,
    });
  }

  await interaction.guild.members.fetch(); // fetch members to update cache

  const guildBirthdays = birthdays[guildId] || {};

  // Remove birthdays for users no longer in the guild
  for (const userId of Object.keys(guildBirthdays)) {
    if (!interaction.guild.members.cache.has(userId)) {
      delete guildBirthdays[userId];
    }
  }

  saveBirthdays(); // save after cleanup

  const entries = Object.entries(guildBirthdays);

  if (entries.length === 0) {
    const embed = new EmbedBuilder()
      .setColor(0xffa500)
      .setTitle("🎂 Birthday List")
      .setDescription("No birthdays set for this server.");
    return interaction.reply({ embeds: [embed] });
  }

  // Sort entries by month then day ascending
  entries.sort((a, b) => {
    if (a[1].month === b[1].month) {
      return a[1].day - b[1].day;
    }
    return a[1].month - b[1].month;
  });

  // Pagination variables
  const itemsPerPage = 5;
  const totalPages = Math.ceil(entries.length / itemsPerPage);

  // Get current month (1-12)
  const currentMonth = new Date().getMonth() + 1;

  // Find first entry index with current month or next closest
  let startIndex = entries.findIndex(
    ([_, { month }]) => month === currentMonth,
  );
  if (startIndex === -1) {
    // No birthdays this month, try next months
    startIndex = entries.findIndex(([_, { month }]) => month > currentMonth);
  }
  if (startIndex === -1) {
    // If still not found, start from first page
    startIndex = 0;
  }

  // Calculate the page number of that index
  let currentPage = Math.floor(startIndex / itemsPerPage);

  // Function to generate embed for a page
  function generateEmbed(page) {
    const slice = entries.slice(page * itemsPerPage, (page + 1) * itemsPerPage);
    const description = slice
      .map(([userId, { month, day }]) => `<@${userId}> → **${month}/${day}**`)
      .join("\n");

    return new EmbedBuilder()
      .setColor(0x00bfff)
      .setTitle(`Birthday List — Page ${page + 1}/${totalPages}`)
      .setDescription(description);
  }

  // Create buttons for pagination
  const backButton = new ButtonBuilder()
    .setCustomId("back")
    .setLabel("◀️")
    .setStyle(ButtonStyle.Primary)
    .setDisabled(true); // initially disabled on first page

  const nextButton = new ButtonBuilder()
    .setCustomId("next")
    .setLabel("▶️")
    .setStyle(ButtonStyle.Primary)
    .setDisabled(totalPages <= 1); // disabled if only 1 page

  const row = new ActionRowBuilder().addComponents(backButton, nextButton);

  // Send initial reply with first page embed + buttons
  await interaction.reply({
    embeds: [generateEmbed(currentPage)],
    components: [row],
  });

  if (totalPages <= 1) return; // No need to paginate if only one page

  // Create collector for button interactions
  const collector = interaction.channel.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 60000, // 1 minute timeout
  });

  collector.on("collect", async (btnInteraction) => {
    if (btnInteraction.user.id !== interaction.user.id) {
      return btnInteraction.reply({
        content: "You can't interact with this pagination.",
        ephemeral: true,
      });
    }

    if (btnInteraction.customId === "back") {
      currentPage--;
    } else if (btnInteraction.customId === "next") {
      currentPage++;
    }

    // Clamp page number between 0 and totalPages-1
    if (currentPage < 0) currentPage = 0;
    if (currentPage > totalPages - 1) currentPage = totalPages - 1;

    // Update buttons disabled state
    backButton.setDisabled(currentPage === 0);
    nextButton.setDisabled(currentPage === totalPages - 1);

    const newRow = new ActionRowBuilder().addComponents(backButton, nextButton);

    await btnInteraction.update({
      embeds: [generateEmbed(currentPage)],
      components: [newRow],
    });
  });

  collector.on("end", async () => {
    // Disable buttons when collector ends
    backButton.setDisabled(true);
    nextButton.setDisabled(true);
    const disabledRow = new ActionRowBuilder().addComponents(
      backButton,
      nextButton,
    );

    try {
      await interaction.editReply({ components: [disabledRow] });
    } catch {
      // message might be deleted or interaction expired
    }
  });
}
// Subcommand: Reset Birthdays
async function handleBdayReset(interaction) {
  birthdays[interaction.guildId] = {};
  saveBirthdays();

  const embed = new EmbedBuilder()
    .setColor(0xff0000)
    .setTitle("🔄 Birthday Reset")
    .setDescription("All birthdays have been cleared for this server.");

  await interaction.reply({ embeds: [embed] });
}

async function handleCustomName(interaction) {
  if (
    !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)
  ) {
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle("Permission Denied")
          .setDescription("Only **Administrators** can use this command."),
      ],
      ephemeral: true,
    });
  }

  const newName = interaction.options.getString("name");

  try {
    await interaction.client.user.setUsername(newName);
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x00ff00)
          .setTitle("Bot Name Changed")
          .setDescription(`Bot name changed to **${newName}**`),
      ],
    });
  } catch (error) {
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle("Failed to Change Name")
          .setDescription(`Error: ${error.message}`),
      ],
      ephemeral: true,
    });
  }
}

async function handleCustomBio(interaction) {
  if (
    !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)
  ) {
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle("Permission Denied")
          .setDescription("Only **Administrators** can update the bot's bio."),
      ],
      ephemeral: true,
    });
  }

  const newBio = interaction.options.getString("bio");

  try {
    // ✅ Update bot application bio

    // ✅ Save in-memory and persist to disk
    bioDescription = newBio;
    saveStateToFile();
    await interaction.client.application.edit({
      description: newBio,
    });

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x00ff00)
          .setTitle("✅ Bio Updated")
          .setDescription(`Bot bio successfully set to:\n\n**${newBio}**`),
      ],
      ephemeral: true,
    });
  } catch (error) {
    console.error("Failed to update bot bio:", error);
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle("❌ Failed to Update Bio")
          .setDescription("Something went wrong. Please try again later."),
      ],
      ephemeral: true,
    });
  }
}

async function handleCustomAvatar(interaction) {
  if (
    !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)
  ) {
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle("Permission Denied")
          .setDescription("Only **Administrators** can use this command."),
      ],
      ephemeral: true,
    });
  }

  const uploadedFile = interaction.options.getAttachment("image");
  const imageUrl = interaction.options.getString("url");

  // Prioritize uploaded file if both are provided
  const avatarUrl = uploadedFile?.url || imageUrl?.trim() || null;

  if (!avatarUrl) {
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle("Missing Image")
          .setDescription("Please provide an image **URL** or upload a file."),
      ],
      ephemeral: true,
    });
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    await interaction.client.user.setAvatar(avatarUrl);
    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x00ff00)
          .setTitle("Avatar Updated")
          .setImage(avatarUrl)
          .setFooter({ text: "Bot Avatar System" }),
      ],
    });
  } catch (error) {
    console.error("Avatar update error:", error);
    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle("Failed to Change Avatar")
          .setDescription("Error: " + error.message || "Unknown error"),
      ],
    });
  }
}

async function handleCustomStatus(interaction) {
  if (
    !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)
  ) {
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle("Permission Denied")
          .setDescription("Only **Administrators** can use this command."),
      ],
      ephemeral: true,
    });
  }

  const status = interaction.options.getString("status"); // online, idle, dnd, invisible
  const activityType = interaction.options.getString("activity_type"); // playing, watching, etc.
  const activityText = interaction.options.getString("activity_text");

  const statusMap = {
    online: "online",
    idle: "idle",
    dnd: "dnd",
    invisible: "invisible",
  };

  const activityTypeMap = {
    playing: ActivityType.Playing,
    watching: ActivityType.Watching,
    listening: ActivityType.Listening,
    competing: ActivityType.Competing,
  };

  try {
    // ✅ 1. Update in memory
    botPresence = {
      status: statusMap[status] || "online",
      activityType: activityType.toLowerCase(),
      activityText,
    };

    // ✅ 2. Save to disk
    saveStateToFile();

    // ✅ 3. Immediately apply presence
    await interaction.client.user.setPresence({
      status: botPresence.status,
      activities: [
        {
          name: botPresence.activityText,
          type:
            activityTypeMap[botPresence.activityType] || ActivityType.Playing,
        },
      ],
    });

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x00ff00)
          .setTitle("Status Updated")
          .setDescription(
            `Status set to **${botPresence.status}**, ${botPresence.activityType} **${botPresence.activityText}**.`,
          ),
      ],
      ephemeral: true,
    });
  } catch (error) {
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle("Failed to Update Status")
          .setDescription(`Error: ${error.message}`),
      ],
      ephemeral: true,
    });
  }
}

async function handleAIChannelCommand(interaction) {
  const noPermissionEmbed = new EmbedBuilder()
    .setColor(0xff5555)
    .setTitle("Missing Permission")
    .setDescription(
      "You need the `Manage Server` permission to use this command.",
    );

  if (!interaction.memberPermissions.has("ManageGuild")) {
    return interaction.reply({
      embeds: [noPermissionEmbed],
      ephemeral: true,
    });
  }

  const channel = interaction.options.getChannel("channel");

  if (!channel || channel.type !== 0) {
    const invalidChannelEmbed = new EmbedBuilder()
      .setColor(0xff5555)
      .setTitle("Invalid Channel")
      .setDescription("Please select a valid **text channel**.");

    return interaction.reply({
      embeds: [invalidChannelEmbed],
      ephemeral: true,
    });
  }

  aiRespondChannel = channel.id;
  saveStateToFile();

  const successEmbed = new EmbedBuilder()
    .setColor(0x00cc99)
    .setTitle("AI Channel Set")
    .setDescription(`The bot will now only respond in <#${channel.id}>.`);

  return interaction.reply({
    embeds: [successEmbed],
    ephemeral: true,
  });
}

async function handleSayCommand(interaction) {
  try {
    // 🔒 Check admin permissions
    if (
      !interaction.member.permissions.has(
        PermissionsBitField.Flags.Administrator,
      )
    ) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle("Permission Denied")
            .setDescription("Only **Administrators** can use this command."),
        ],
        ephemeral: true,
      });
    }

    const channel = interaction.options.getChannel("channel");
    const message = interaction.options.getString("message");
    const image1 = interaction.options.getAttachment("image1");
    const image2 = interaction.options.getAttachment("image2");
    const image3 = interaction.options.getAttachment("image3");

    if (!channel || (!channel.isTextBased() && channel.type !== 15)) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle("Invalid Channel")
            .setDescription(
              "Please provide a valid **text** or **forum** channel.",
            ),
        ],
        ephemeral: true,
      });
    }

    const files = [image1, image2, image3].filter(Boolean);

    // ⏳ Defer early to prevent timeout
    await interaction.deferReply({ ephemeral: true });

    if (channel.type === 15) {
      // 🧵 Forum channel (type 15): create a new thread with a post
      await channel.threads.create({
        name: message.slice(0, 90) || "New Thread",
        message: {
          content: message,
          files,
        },
      });
    } else {
      // 💬 Text channel: just send a message
      await channel.send({
        content: message,
        files,
      });
    }

    // ✅ Confirmation message
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x00ff00)
          .setTitle("Message Sent")
          .setDescription(`Message sent to ${channel}.`),
      ],
    });
  } catch (error) {
    console.error("Error in /say command:", error);

    if (interaction.deferred) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle("Something Went Wrong")
            .setDescription(
              "An unexpected error occurred. Please try again later.",
            ),
        ],
      });
    } else {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle("Something Went Wrong")
            .setDescription(
              "An unexpected error occurred. Please try again later.",
            ),
        ],
        ephemeral: true,
      });
    }
  }
}

async function handleSayEmbed(interaction) {
  try {
    // Check if user is an Administrator
    if (
      !interaction.member.permissions.has(
        PermissionsBitField.Flags.Administrator,
      )
    ) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle("Permission Denied")
            .setDescription(
              "Only server **Administrators** can use this command.",
            ),
        ],
        ephemeral: true,
      });
    }

    const channel = interaction.options.getChannel("channel");
    if (!channel || !channel.isTextBased()) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle("Invalid Channel")
            .setDescription("Please choose a valid text channel or forum."),
        ],
        ephemeral: true,
      });
    }

    // Collect all options
    const title = interaction.options.getString("title");
    const description = interaction.options.getString("description");
    const colorInput = interaction.options.getString("color");
    const url = interaction.options.getString("url");
    const author = interaction.options.getString("author");
    const authorIcon = interaction.options.getString("author_icon");
    const thumbnail = interaction.options.getString("thumbnail");
    const image = interaction.options.getString("image");
    const footer = interaction.options.getString("footer");
    const footerIcon = interaction.options.getString("footer_icon");
    const addTimestamp = interaction.options.getBoolean("timestamp");
    const fieldsRaw = interaction.options.getString("fields");

    // Construct embed
    const embed = new EmbedBuilder();

    if (title) embed.setTitle(title);
    if (description) embed.setDescription(description);
    if (colorInput) {
      try {
        embed.setColor(
          /^#/.test(colorInput)
            ? parseInt(colorInput.slice(1), 16)
            : colorInput.toUpperCase(),
        );
      } catch {
        embed.setColor(0x3498db); // fallback color
      }
    }

    if (url) embed.setURL(url);
    if (author) embed.setAuthor({ name: author, iconURL: authorIcon || null });
    if (thumbnail) embed.setThumbnail(thumbnail);
    if (image) embed.setImage(image);
    if (footer) embed.setFooter({ text: footer, iconURL: footerIcon || null });
    if (addTimestamp) embed.setTimestamp();

    if (fieldsRaw) {
      try {
        const fields = JSON.parse(fieldsRaw);
        if (Array.isArray(fields)) {
          embed.addFields(fields);
        }
      } catch (err) {
        console.warn("Invalid JSON for fields:", err);
      }
    }

    await channel.send({ embeds: [embed] });

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x00ff00)
          .setTitle("Embed Sent")
          .setDescription(`Embed sent to ${channel}`),
      ],
      ephemeral: true,
    });
  } catch (err) {
    console.error("Error in say-embed:", err);
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle("Unexpected Error")
          .setDescription("Something went wrong. Please try again later."),
      ],
      ephemeral: true,
    });
  }
}

async function handlePurgeCommand(interaction) {
  const amount = interaction.options.getInteger("amount");
  const filter = interaction.options.getString("filter");
  const user = interaction.options.getUser("user");
  if (interaction.channel.type === ChannelType.DM) {
    const dmEmbed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle("Command Not Available")
      .setDescription("This command cannot be used in DMs.");
    return interaction.reply({ embeds: [dmEmbed], ephemeral: true });
  }

  if (
    !interaction.member.permissions.has(
      PermissionsBitField.Flags.ManageMessages,
    )
  ) {
    const permEmbed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle("Permission Denied")
      .setDescription(
        "You need the **Manage Messages** permission to use this command.",
      );
    return interaction.reply({ embeds: [permEmbed], ephemeral: true });
  }

  if (
    !interaction.guild.members.me.permissions.has(
      PermissionsBitField.Flags.ManageMessages,
    )
  ) {
    const botPermEmbed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle("Missing Bot Permission")
      .setDescription(
        "I need the **Manage Messages** permission to delete messages.",
      );
    return interaction.reply({ embeds: [botPermEmbed], ephemeral: true });
  }

  try {
    const messages = await interaction.channel.messages.fetch({ limit: 100 });

    const filtered = messages.filter((msg) => {
      if (msg.id === interaction.id) return false;
      if (user && msg.author.id !== user.id) return false;
      if (filter === "bots" && !msg.author.bot) return false;
      if (filter === "humans" && msg.author.bot) return false;
      if (filter === "links" && !/(https?:\/\/[^\s]+)/gi.test(msg.content))
        return false;
      if (
        filter === "invites" &&
        !/(discord\.gg\/|discord\.com\/invite\/)/gi.test(msg.content)
      )
        return false;
      return true;
    });

    const toDelete = filtered.first(amount);

    if (!toDelete.length) {
      const noMatchEmbed = new EmbedBuilder()
        .setColor(0xffa500)
        .setTitle("No Matching Messages")
        .setDescription("No messages matched your filter.");
      return interaction.reply({ embeds: [noMatchEmbed], ephemeral: true });
    }

    await interaction.channel.bulkDelete(toDelete, true);

    const successEmbed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle("Messages Purged")
      .setDescription(`Successfully deleted **${toDelete.length}** message(s).`)
      .addFields(
        { name: "Filter", value: filter || "None", inline: true },
        { name: "User", value: user ? `<@${user.id}>` : "Any", inline: true },
      );

    await interaction.reply({ embeds: [successEmbed], ephemeral: true });
  } catch (error) {
    console.error(error);
    const errorEmbed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle("Purge Failed")
      .setDescription("An unexpected error occurred while purging messages.");
    await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
  }
}
//

// <==========>

// <=====[Interaction Reply 2 (Others)]=====>

async function clearChatHistory(interaction) {
  try {
    chatHistories[interaction.user.id] = {};
    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle("Chat History Cleared")
      .setDescription("Chat history cleared!");
    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (error) {
    console.log(error.message);
  }
}

async function alwaysRespond(interaction) {
  try {
    const userId = interaction.user.id;
    const channelId = interaction.channelId;

    if (interaction.channel.type === ChannelType.DM) {
      const dmDisabledEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle("Feature Disabled in DMs")
        .setDescription("This feature is disabled in direct messages.");
      await interaction.reply({ embeds: [dmDisabledEmbed], ephemeral: true });
      return;
    }

    if (!activeUsersInChannels[channelId]) {
      activeUsersInChannels[channelId] = {};
    }

    if (activeUsersInChannels[channelId][userId]) {
      delete activeUsersInChannels[channelId][userId];
    } else {
      activeUsersInChannels[channelId][userId] = true;
    }
  } catch (error) {
    console.log(error.message);
  }
}

async function handleRespondToAllCommand(interaction) {
  try {
    if (interaction.channel.type === ChannelType.DM) {
      const dmEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle("Command Not Available")
        .setDescription("This command cannot be used in DMs.");
      return interaction.reply({ embeds: [dmEmbed], ephemeral: true });
    }

    if (
      !interaction.member.permissions.has(
        PermissionsBitField.Flags.Administrator,
      )
    ) {
      const adminEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle("Admin Required")
        .setDescription("You need to be an admin to use this command.");
      return interaction.reply({ embeds: [adminEmbed], ephemeral: true });
    }

    const channelId = interaction.channelId;
    if (alwaysRespondChannels[channelId]) {
      delete alwaysRespondChannels[channelId];
      const stopRespondEmbed = new EmbedBuilder()
        .setColor(0xffa500)
        .setTitle("Bot Response Disabled")
        .setDescription(
          "The bot will now stop responding to all messages in this channel.",
        );
      await interaction.reply({ embeds: [stopRespondEmbed], ephemeral: false });
    } else {
      alwaysRespondChannels[channelId] = true;
      const startRespondEmbed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle("Bot Response Enabled")
        .setDescription(
          "The bot will now respond to all messages in this channel.",
        );
      await interaction.reply({
        embeds: [startRespondEmbed],
        ephemeral: false,
      });
    }
  } catch (error) {
    console.log(error.message);
  }
}

async function toggleChannelChatHistory(interaction) {
  try {
    if (interaction.channel.type === ChannelType.DM) {
      const dmEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle("Command Not Available")
        .setDescription("This command cannot be used in DMs.");
      return interaction.reply({ embeds: [dmEmbed], ephemeral: true });
    }

    if (
      !interaction.member.permissions.has(
        PermissionsBitField.Flags.Administrator,
      )
    ) {
      const adminEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle("Admin Required")
        .setDescription("You need to be an admin to use this command.");
      return interaction.reply({ embeds: [adminEmbed], ephemeral: true });
    }

    const channelId = interaction.channelId;
    const enabled = interaction.options.getBoolean("enabled");
    const instructions =
      interaction.options.getString("instructions") || defaultPersonality;

    if (enabled) {
      channelWideChatHistory[channelId] = true;
      customInstructions[channelId] = instructions;

      const enabledEmbed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle("Channel History Enabled")
        .setDescription(`Channel-wide chat history has been enabled.`);
      await interaction.reply({ embeds: [enabledEmbed], ephemeral: false });
    } else {
      delete channelWideChatHistory[channelId];
      delete customInstructions[channelId];
      delete chatHistories[channelId];

      const disabledEmbed = new EmbedBuilder()
        .setColor(0xffa500)
        .setTitle("Channel History Disabled")
        .setDescription("Channel-wide chat history has been disabled.");
      await interaction.reply({ embeds: [disabledEmbed], ephemeral: false });
    }
  } catch (error) {
    console.error("Error in toggleChannelChatHistory:", error);
  }
}

async function handleStatusCommand(interaction) {
  try {
    const initialEmbed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setTitle("System Information")
      .setDescription("Fetching system information...")
      .setTimestamp();

    const message = await interaction.reply({
      embeds: [initialEmbed],
      fetchReply: true,
    });

    const updateMessage = async () => {
      try {
        const [
          { totalMemMb, usedMemMb, freeMemMb, freeMemPercentage },
          cpuPercentage,
        ] = await Promise.all([mem.info(), cpu.usage()]);

        const now = new Date();
        const nextReset = new Date();
        nextReset.setHours(0, 0, 0, 0);
        if (nextReset <= now) {
          nextReset.setDate(now.getDate() + 1);
        }
        const timeLeftMillis = nextReset - now;
        const hours = Math.floor(timeLeftMillis / 3600000);
        const minutes = Math.floor((timeLeftMillis % 3600000) / 60000);
        const seconds = Math.floor((timeLeftMillis % 60000) / 1000);
        const timeLeft = `${hours}h ${minutes}m ${seconds}s`;

        const embed = new EmbedBuilder()
          .setColor(hexColour)
          .setTitle("System Information")
          .addFields(
            {
              name: "Memory (RAM)",
              value: `Total Memory: \`${totalMemMb}\` MB\nUsed Memory: \`${usedMemMb}\` MB\nFree Memory: \`${freeMemMb}\` MB\nPercentage Of Free Memory: \`${freeMemPercentage}\`%`,
              inline: true,
            },
            {
              name: "CPU",
              value: `Percentage of CPU Usage: \`${cpuPercentage}\`%`,
              inline: true,
            },
            { name: "Time Until Next Reset", value: timeLeft, inline: true },
          )
          .setTimestamp();

        await message.edit({ embeds: [embed] });
      } catch (error) {
        console.error("Error updating message:", error);
        clearInterval(interval);
      }
    };

    await updateMessage();

    const interval = setInterval(async () => {
      try {
        await updateMessage();
      } catch (error) {
        clearInterval(interval);
        console.error("Stopping updates due to error:", error);
      }
    }, 2000);

    setTimeout(() => {
      clearInterval(interval);
    }, 30000);
  } catch (error) {
    console.error("Error in handleStatusCommand function:", error);
  }
}

function initializeBlacklistForGuild(guildId) {
  try {
    if (!blacklistedUsers[guildId]) {
      blacklistedUsers[guildId] = [];
    }
    if (!serverSettings[guildId]) {
      serverSettings[guildId] = defaultServerSettings;
    }
  } catch (error) {}
}

async function handleBlacklistCommand(interaction) {
  try {
    if (interaction.channel.type === ChannelType.DM) {
      const dmEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle("Command Not Available")
        .setDescription("This command cannot be used in DMs.");
      return interaction.reply({ embeds: [dmEmbed], ephemeral: true });
    }

    if (
      !interaction.member.permissions.has(
        PermissionsBitField.Flags.Administrator,
      )
    ) {
      const adminEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle("Admin Required")
        .setDescription("You need to be an admin to use this command.");
      return interaction.reply({ embeds: [adminEmbed], ephemeral: true });
    }

    const userId = interaction.options.getUser("user").id;

    // Initialize blacklist for the guild if it doesn't exist
    if (!blacklistedUsers[interaction.guild.id]) {
      blacklistedUsers[interaction.guild.id] = [];
    }

    if (!blacklistedUsers[interaction.guild.id].includes(userId)) {
      blacklistedUsers[interaction.guild.id].push(userId);
      const blacklistedEmbed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle("User Blacklisted")
        .setDescription(`<@${userId}> has been blacklisted.`);
      await interaction.reply({ embeds: [blacklistedEmbed] });
    } else {
      const alreadyBlacklistedEmbed = new EmbedBuilder()
        .setColor(0xffa500)
        .setTitle("User Already Blacklisted")
        .setDescription(`<@${userId}> is already blacklisted.`);
      await interaction.reply({ embeds: [alreadyBlacklistedEmbed] });
    }
  } catch (error) {
    console.log(error.message);
  }
}

async function handleWhitelistCommand(interaction) {
  try {
    if (interaction.channel.type === ChannelType.DM) {
      const dmEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle("Command Not Available")
        .setDescription("This command cannot be used in DMs.");
      return interaction.reply({ embeds: [dmEmbed], ephemeral: true });
    }

    if (
      !interaction.member.permissions.has(
        PermissionsBitField.Flags.Administrator,
      )
    ) {
      const adminEmbed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle("Admin Required")
        .setDescription("You need to be an admin to use this command.");
      return interaction.reply({ embeds: [adminEmbed], ephemeral: true });
    }

    const userId = interaction.options.getUser("user").id;

    // Ensure the guild's blacklist is initialized
    if (!blacklistedUsers[interaction.guild.id]) {
      blacklistedUsers[interaction.guild.id] = [];
    }

    const index = blacklistedUsers[interaction.guild.id].indexOf(userId);
    if (index > -1) {
      blacklistedUsers[interaction.guild.id].splice(index, 1);
      const removedEmbed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle("User Whitelisted")
        .setDescription(`<@${userId}> has been removed from the blacklist.`);
      await interaction.reply({ embeds: [removedEmbed] });
    } else {
      const notFoundEmbed = new EmbedBuilder()
        .setColor(0xffa500)
        .setTitle("User Not Found")
        .setDescription(`<@${userId}> is not in the blacklist.`);
      await interaction.reply({ embeds: [notFoundEmbed] });
    }
  } catch (error) {
    console.log(error.message);
  }
}

async function toggleServerWideChatHistory(interaction) {
  try {
    if (!interaction.guild) {
      const embed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle("Server Command Only")
        .setDescription("This command can only be used in a server.");
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    const serverId = interaction.guild.id;
    initializeBlacklistForGuild(serverId);

    // Toggle the server-wide chat history setting
    serverSettings[serverId].serverChatHistory =
      !serverSettings[serverId].serverChatHistory;
    const statusMessage = `Server-wide Chat History is now \`${serverSettings[serverId].serverChatHistory ? "enabled" : "disabled"}\``;

    let warningMessage = "";
    if (
      serverSettings[serverId].serverChatHistory &&
      !serverSettings[serverId].customServerPersonality
    ) {
      warningMessage =
        "\n\n⚠️ **Warning:** Enabling server-side chat history without enhancing server-wide personality management is not recommended. The bot may get confused between its personalities and conversations with different users.";
    }

    const embed = new EmbedBuilder()
      .setColor(
        serverSettings[serverId].serverChatHistory ? 0x00ff00 : 0xff0000,
      )
      .setTitle("Chat History Toggled")
      .setDescription(statusMessage + warningMessage);

    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (error) {
    console.log("Error toggling server-wide chat history:", error.message);
  }
}

async function toggleServerResponsePreference(interaction) {
  try {
    if (!interaction.guild) {
      const embed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle("Server Command Only")
        .setDescription("This command can only be used in a server.");
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    const serverId = interaction.guild.id;
    initializeBlacklistForGuild(serverId);

    // Toggle the server-wide response preference
    serverSettings[serverId].serverResponsePreference =
      !serverSettings[serverId].serverResponsePreference;
    const statusMessage = `Server-wide Response Following is now \`${serverSettings[serverId].serverResponsePreference ? "enabled" : "disabled"}\``;

    const embed = new EmbedBuilder()
      .setColor(
        serverSettings[serverId].serverResponsePreference ? 0x00ff00 : 0xff0000,
      )
      .setTitle("Server Response Preference Toggled")
      .setDescription(statusMessage);

    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (error) {
    console.log(
      "Error toggling server-wide response preference:",
      error.message,
    );
  }
}

async function clearServerChatHistory(interaction) {
  try {
    if (!interaction.guild) {
      const embed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle("Server Command Only")
        .setDescription("This command can only be used in a server.");
      await interaction.reply({ embeds: [embed], ephemeral: true });
      return;
    }

    const serverId = interaction.guild.id;
    initializeBlacklistForGuild(serverId);

    if (serverSettings[serverId].serverChatHistory) {
      // Clear the server-wide chat history if it's enabled
      chatHistories[serverId] = {};
      const clearedEmbed = new EmbedBuilder()
        .setColor(0x00ff00)
        .setTitle("Chat History Cleared")
        .setDescription("Server-wide chat history cleared!");
      await interaction.reply({ embeds: [clearedEmbed], ephemeral: true });
    } else {
      // If chat history is disabled, inform the user
      const disabledEmbed = new EmbedBuilder()
        .setColor(0xffa500)
        .setTitle("Feature Disabled")
        .setDescription(
          "Server-wide chat history is disabled for this server.",
        );
      await interaction.reply({ embeds: [disabledEmbed], ephemeral: true });
    }
  } catch (error) {
    console.log("Failed to clear server-wide chat history:", error.message);
  }
}

async function toggleServerPreference(interaction) {
  try {
    const guildId = interaction.guild.id;
    if (serverSettings[guildId].responseStyle === "embedded") {
      serverSettings[guildId].responseStyle = "normal";
    } else {
      serverSettings[guildId].responseStyle = "embedded";
    }
    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle("Server Response Style Updated")
      .setDescription(
        `Server response style updated to: ${serverSettings[guildId].responseStyle}`,
      );

    await interaction.reply({ embeds: [embed], ephemeral: true });
  } catch (error) {
    console.log(error.message);
  }
}

// <=====[Others]=====>

async function addDeleteButton(botMessage, msgId) {
  try {
    const messageComponents = botMessage.components || [];
    const downloadButton = new ButtonBuilder()
      .setCustomId(`delete_message-${msgId}`)
      .setLabel("Delete")
      .setEmoji("🗑️")
      .setStyle(ButtonStyle.Secondary);

    let actionRow;
    if (
      messageComponents.length > 0 &&
      messageComponents[0].type === ComponentType.ActionRow
    ) {
      actionRow = ActionRowBuilder.from(messageComponents[0]);
    } else {
      actionRow = new ActionRowBuilder();
    }

    actionRow.addComponents(downloadButton);
    return await botMessage.edit({ components: [actionRow] });
  } catch (error) {
    console.error("Error adding delete button:", error.message);
    return botMessage;
  }
}

// Function to get user preference
function getUserResponsePreference(userId) {
  return userResponsePreference[userId] || defaultResponseFormat;
}
async function handleModelResponse(
  initialBotMessage,
  chat,
  parts,
  originalMessage,
  typingInterval,
  historyId,
) {
  const userId = originalMessage.author.id;
  const userResponsePreference =
    originalMessage.guild &&
    serverSettings[originalMessage.guild.id]?.serverResponsePreference
      ? serverSettings[originalMessage.guild.id].responseStyle
      : getUserResponsePreference(userId);
  const maxCharacterLimit = userResponsePreference === "embedded" ? 3900 : 1900;
  let attempts = 3;

  let updateTimeout;
  let tempResponse = "";
  let functionCallsString = "";
  let botMessage;
  if (!initialBotMessage) {
    clearInterval(typingInterval);
    try {
      botMessage = await originalMessage.reply({
        content: "Let me think..",
      });
    } catch (error) {}
  } else {
    botMessage = initialBotMessage;
    try {
      botMessage.edit({ components: [] });
    } catch (error) {}
  }

  let stopGeneration = false;

  const updateMessage = () => {
    if (stopGeneration) return;
    if (tempResponse.trim() === "") {
      botMessage.edit({ content: "..." });
    } else if (userResponsePreference === "embedded") {
      updateEmbed(
        botMessage,
        tempResponse,
        originalMessage,
        functionCallsString,
      );
    } else {
      botMessage.edit({ content: tempResponse, embeds: [] });
    }
    clearTimeout(updateTimeout);
    updateTimeout = null;
  };

  while (attempts > 0 && !stopGeneration) {
    try {
      let finalResponse = "";
      let isLargeResponse = false;
      const newHistory = [];
      newHistory.push({ role: "user", content: parts });

      async function getResponse(parts) {
        let newResponse = "";
        const messageResult = await chat.sendMessageStream(parts);
        for await (const chunk of messageResult.stream) {
          if (stopGeneration) break;

          const chunkText = chunk.text();
          finalResponse += chunkText;
          tempResponse += chunkText;
          newResponse += chunkText;

          const toolCalls = chunk.functionCalls();
          if (toolCalls) {
            newHistory.push({
              role: "assistant",
              content: [{ text: newResponse }],
            });
            newResponse = "";

            function convertArrayFormat(inputArray) {
              return inputArray.map((item) => ({
                functionCall: {
                  name: item.name,
                  args: item.args,
                },
              }));
            }
            const modelParts = convertArrayFormat(toolCalls);
            newHistory.push({ role: "assistant", content: modelParts });

            const toolCallsResults = [];
            for (const toolCall of toolCalls) {
              const result = await manageToolCall(toolCall);
              toolCallsResults.push(result);
            }
            newHistory.push({ role: "user", content: toolCallsResults });

            functionCallsString =
              functionCallsString.trim() +
              "\n" +
              `- ${processFunctionCallsNames(toolCalls)}`;

            return await getResponse(toolCallsResults);
          }

          if (finalResponse.length > maxCharacterLimit) {
            if (!isLargeResponse) {
              isLargeResponse = true;
              const embed = new EmbedBuilder()
                .setColor(0xffff00)
                .setTitle("Response Overflow")
                .setDescription(
                  "The response got too large, will be sent as a text file once it is completed.",
                );
              botMessage.edit({ embeds: [embed], components: [] });
            }
          } else if (!updateTimeout) {
            updateTimeout = setTimeout(updateMessage, 500);
          }
        }
        newHistory.push({
          role: "assistant",
          content: [{ text: newResponse }],
        });
      }

      await getResponse(parts);

      if (isLargeResponse) {
        sendAsTextFile(finalResponse, originalMessage, botMessage.id);
      }

      botMessage = await addDeleteButton(botMessage, botMessage.id);

      updateChatHistory(historyId, newHistory, botMessage.id);
      break;
    } catch (error) {
      if (activeRequests.has(userId)) activeRequests.delete(userId);
      console.error("Generation Attempt Failed: ", error);
      attempts--;

      if (attempts === 0 || stopGeneration) {
        if (!stopGeneration) {
          if (SEND_RETRY_ERRORS_TO_DISCORD) {
            const embed = new EmbedBuilder()
              .setColor(0xff0000)
              .setTitle("Generation Failure")
              .setDescription(`All Generation Attempts Failed :(\n\
\`\`\`${error.message}\`\`\``);
            const errorMsg = await originalMessage.channel.send({
              content: `<@${originalMessage.author.id}>`,
              embeds: [embed],
            });
            await addDeleteButton(errorMsg, errorMsg.id);
            await addDeleteButton(botMessage, botMessage.id);
          } else {
            const simpleErrorEmbed = new EmbedBuilder()
              .setColor(0xff0000)
              .setTitle("Bot Overloaded")
              .setDescription(
                "Something seems off, the bot might be overloaded! :(",
              );
            const errorMsg = await originalMessage.channel.send({
              content: `<@${originalMessage.author.id}>`,
              embeds: [simpleErrorEmbed],
            });
            await addDeleteButton(errorMsg, errorMsg.id);
            await addDeleteButton(botMessage, botMessage.id);
          }
        }
        break;
      } else if (SEND_RETRY_ERRORS_TO_DISCORD) {
        const errorMsg = await originalMessage.channel.send({
          content: `<@${originalMessage.author.id}>`,
          embeds: [
            new EmbedBuilder().setColor(0xffff00).setTitle("Retry in Progress")
              .setDescription(`Generation Attempt(s) Failed, Retrying..\n\
\`\`\`${error.message}\`\`\``),
          ],
        });
        setTimeout(() => errorMsg.delete().catch(console.error), 5000);
        await delay(500);
      }
    }
  }
  saveStateToFile();
  if (activeRequests.has(userId)) activeRequests.delete(userId);
}

function updateEmbed(botMessage, finalResponse, message, functionCallsString) {
  try {
    const isGuild = message.guild !== null;
    const embed = new EmbedBuilder()
      .setColor(hexColour)
      .setDescription(finalResponse)
      .setAuthor({
        name: `To ${message.author.displayName}`,
        iconURL: message.author.displayAvatarURL(),
      })
      .setTimestamp();

    if (isGuild) {
      embed.setFooter({
        text: message.guild.name,
        iconURL:
          message.guild.iconURL() ||
          "https://ai.google.dev/static/site-assets/images/share.png",
      });
    }

    if (functionCallsString.trim().length > 0) {
      embed.addFields({ name: "Function Calls:", value: functionCallsString });
    }

    botMessage.edit({ content: " ", embeds: [embed] });
  } catch (error) {
    console.error("An error occurred while updating the embed:", error.message);
  }
}

async function sendAsTextFile(text, message, orgId) {
  try {
    const filename = `response-${Date.now()}.txt`;
    await writeFile(filename, text);

    const botMessage = await message.channel.send({
      content: `<@${message.author.id}>, Here is the response:`,
      files: [filename],
    });
    await addDeleteButton(botMessage, orgId);
    await unlink(filename);
  } catch (error) {
    console.error("An error occurred:", error);
  }
}

function getHistory(id) {
  const historyObject = chatHistories[id] || {};
  let combinedHistory = [];
  for (const messagesId in historyObject) {
    if (historyObject.hasOwnProperty(messagesId)) {
      combinedHistory = [...combinedHistory, ...historyObject[messagesId]];
    }
  }
  return combinedHistory.map((entry) => {
    return {
      role: entry.role === "assistant" ? "model" : entry.role,
      parts: entry.content,
    };
  });
}

function updateChatHistory(id, newHistory, messagesId) {
  if (!chatHistories[id]) chatHistories[id] = {};
  if (!chatHistories[id][messagesId]) chatHistories[id][messagesId] = [];
  chatHistories[id][messagesId] = [
    ...chatHistories[id][messagesId],
    ...newHistory,
  ];
}

// <==========>

client.login(token);
