// ============================================================
// البوت المحسن - نسخة متكاملة مع قاعدة بيانات MongoDB
// ============================================================

require('dotenv').config();
const {
  Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
  PermissionsBitField, ChannelType, ModalBuilder,
  TextInputBuilder, TextInputStyle, ActivityType
} = require('discord.js');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const express = require('express');
const mongoose = require('mongoose');
const app = express();
const port = process.env.PORT || 3000;

// ========== خادم الويب ==========
app.get('/', (req, res) => res.send('✅ البوت يعمل'));
app.listen(port, () => console.log(`🌐 خادم الويب على المنفذ ${port}`));

// ========== متغيرات البيئة ==========
const TOKEN = process.env.DISCORD_TOKEN;
const MONGO_URI = process.env.MONGO_URI;
const OWNER_ID = process.env.OWNER_ID || null;

if (!TOKEN || !MONGO_URI) {
  console.error('❌ تأكد من وجود DISCORD_TOKEN و MONGO_URI في ملف .env');
  process.exit(1);
}

// ========== اتصال قاعدة البيانات ==========
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ اتصال MongoDB ناجح'))
  .catch(err => { console.error('❌ فشل اتصال MongoDB:', err); process.exit(1); });

// ============================================================
// ========== نماذج قاعدة البيانات (Mongoose) ==========
// ============================================================

// نموذج الإعدادات العامة للسيرفر
const GuildConfigSchema = new mongoose.Schema({
  guildId: { type: String, unique: true, required: true },
  logChannel: String,
  welcomeChannel: String,
  welcomeMessage: { type: String, default: 'أهلاً بك في السيرفر! 🎉' },
  welcomeTitle: { type: String, default: '🔥 مرحباً بك في المجتمع' },
  welcomeImage: String,
  muteRole: String,
  joinRole: String,
  ticketPanelImage: String,
  rolesImage: String,
  bannerImage: String,
  generalImage: String,
  levelChannelId: String,
  suggestionsChannel: String,
  suggestionsTitle: { type: String, default: '💡 قناة الاقتراحات' },
  suggestionsDescription: { type: String, default: 'هل لديك فكرة لتطوير السيرفر؟ شاركنا اقتراحك!' },
  suggestionsColor: { type: String, default: '#cc0000' },
  suggestionsImage: String,
  economyRole: String,
}, { timestamps: true });

// نموذج بيانات المستخدم (المستويات والرسائل)
const UserDataSchema = new mongoose.Schema({
  guildId: String,
  userId: String,
  xp: { type: Number, default: 0 },
  level: { type: Number, default: 0 },
  messages: { type: Number, default: 0 },
}, { timestamps: true });
UserDataSchema.index({ guildId: 1, userId: 1 }, { unique: true });

// نموذج الاقتصاد
const EconomySchema = new mongoose.Schema({
  guildId: String,
  userId: String,
  od: { type: Number, default: 0 },
  messageCount: { type: Number, default: 0 },
  voiceSeconds: { type: Number, default: 0 },
  lastVoiceJoin: Date,
}, { timestamps: true });
EconomySchema.index({ guildId: 1, userId: 1 }, { unique: true });

// نموذج التحذيرات
const WarnSchema = new mongoose.Schema({
  guildId: String,
  userId: String,
  reason: String,
  moderator: String,
  date: { type: Date, default: Date.now },
});

// نموذج إعدادات التذاكر
const TicketSettingsSchema = new mongoose.Schema({
  guildId: { type: String, unique: true, required: true },
  sections: [{
    name: String,
    roleId: String,
    emoji: { type: String, default: '📌' },
  }],
  text: { type: String, default: 'مرحباً بكم جميعاً في قسم التذاكر، لفتح تذكرة أرجو ضغط على القائمة أدناه واختيار التذكرة التي تناسبك.' },
  image: { type: String, default: 'https://i.imgur.com/GkKqN3G.png' },
});

// نموذج الأوتو لاين
const AutoLineSchema = new mongoose.Schema({
  guildId: { type: String, unique: true, required: true },
  channelId: String,
  text: String,
  image: String,
  enabled: { type: Boolean, default: false },
});

// نموذج الردود التلقائية
const AutoReplySchema = new mongoose.Schema({
  guildId: String,
  keyword: String,
  reply: String,
  image: String,
});
AutoReplySchema.index({ guildId: 1, keyword: 1 }, { unique: true });

// نموذج رتب المستويات
const LevelRoleSchema = new mongoose.Schema({
  guildId: String,
  level: Number,
  roleId: String,
});
LevelRoleSchema.index({ guildId: 1, level: 1 }, { unique: true });

// نموذج المتحكمين
const ControllerSchema = new mongoose.Schema({
  guildId: String,
  userId: String,
});
ControllerSchema.index({ guildId: 1, userId: 1 }, { unique: true });

// تعريف النماذج
const GuildConfig = mongoose.model('GuildConfig', GuildConfigSchema);
const UserData = mongoose.model('UserData', UserDataSchema);
const Economy = mongoose.model('Economy', EconomySchema);
const Warn = mongoose.model('Warn', WarnSchema);
const TicketSettings = mongoose.model('TicketSettings', TicketSettingsSchema);
const AutoLine = mongoose.model('AutoLine', AutoLineSchema);
const AutoReply = mongoose.model('AutoReply', AutoReplySchema);
const LevelRole = mongoose.model('LevelRole', LevelRoleSchema);
const Controller = mongoose.model('Controller', ControllerSchema);

// ============================================================
// ========== دوال مساعدة للوصول إلى البيانات ==========
// ============================================================

async function getGuildConfig(guildId) {
  let config = await GuildConfig.findOne({ guildId });
  if (!config) {
    config = new GuildConfig({ guildId });
    await config.save();
  }
  return config;
}

async function updateGuildConfig(guildId, data) {
  await GuildConfig.findOneAndUpdate({ guildId }, data, { upsert: true, new: true });
}

async function getUserData(guildId, userId) {
  let data = await UserData.findOne({ guildId, userId });
  if (!data) {
    data = new UserData({ guildId, userId });
    await data.save();
  }
  return data;
}

async function updateUserData(guildId, userId, update) {
  await UserData.findOneAndUpdate({ guildId, userId }, update, { upsert: true });
}

async function getEconomy(guildId, userId) {
  let eco = await Economy.findOne({ guildId, userId });
  if (!eco) {
    eco = new Economy({ guildId, userId });
    await eco.save();
  }
  return eco;
}

async function updateEconomy(guildId, userId, update) {
  await Economy.findOneAndUpdate({ guildId, userId }, update, { upsert: true });
}

async function getTicketSettings(guildId) {
  let settings = await TicketSettings.findOne({ guildId });
  if (!settings) {
    settings = new TicketSettings({ guildId });
    await settings.save();
  }
  return settings;
}

async function updateTicketSettings(guildId, data) {
  await TicketSettings.findOneAndUpdate({ guildId }, data, { upsert: true });
}

async function getAutoLine(guildId) {
  let auto = await AutoLine.findOne({ guildId });
  if (!auto) {
    auto = new AutoLine({ guildId });
    await auto.save();
  }
  return auto;
}

async function setAutoLine(guildId, data) {
  await AutoLine.findOneAndUpdate({ guildId }, data, { upsert: true });
}

async function getAutoReplies(guildId) {
  return await AutoReply.find({ guildId });
}

async function addAutoReply(guildId, keyword, reply, image = null) {
  const existing = await AutoReply.findOne({ guildId, keyword: { $regex: new RegExp(`^${keyword}$`, 'i') } });
  if (existing) {
    existing.reply = reply;
    existing.image = image;
    await existing.save();
    return false; // تم التحديث
  } else {
    const newReply = new AutoReply({ guildId, keyword, reply, image });
    await newReply.save();
    return true; // تم الإضافة
  }
}

async function removeAutoReply(guildId, keyword) {
  const result = await AutoReply.deleteOne({ guildId, keyword: { $regex: new RegExp(`^${keyword}$`, 'i') } });
  return result.deletedCount > 0;
}

async function findAutoReply(guildId, content) {
  const replies = await AutoReply.find({ guildId });
  return replies.find(r => content.toLowerCase().includes(r.keyword.toLowerCase()));
}

async function getLevelXP(level) { return (level + 1) * 100; }

// دوال التحذيرات
async function getWarns(guildId, userId) {
  return await Warn.find({ guildId, userId });
}

async function addWarn(guildId, userId, reason, moderator) {
  const warn = new Warn({ guildId, userId, reason, moderator });
  await warn.save();
  return (await Warn.countDocuments({ guildId, userId }));
}

async function clearWarns(guildId, userId) {
  await Warn.deleteMany({ guildId, userId });
}

// دوال المتحكمين
async function isController(userId, guildId) {
  if (OWNER_ID && userId === OWNER_ID) return true;
  const controller = await Controller.findOne({ guildId, userId });
  return !!controller;
}

async function addController(guildId, userId) {
  const existing = await Controller.findOne({ guildId, userId });
  if (!existing) {
    const c = new Controller({ guildId, userId });
    await c.save();
    return true;
  }
  return false;
}

async function removeController(guildId, userId) {
  const result = await Controller.deleteOne({ guildId, userId });
  return result.deletedCount > 0;
}

async function getControllers(guildId) {
  const docs = await Controller.find({ guildId });
  return docs.map(d => d.userId);
}

async function hasPermission(member, guildId) {
  if (!member) return false;
  if (OWNER_ID && member.id === OWNER_ID) return true;
  return await isController(member.id, guildId);
}

// ============================================================
// ========== العميل ==========
// ============================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMembers,
  ],
});

client.once('ready', async () => {
  console.log(`✅ البوت جاهز باسم ${client.user.tag}`);
  if (OWNER_ID) console.log(`👑 صاحب البوت: ${OWNER_ID}`);
  client.user.setActivity('🔥 !مساعدة | البوت', { type: ActivityType.Watching });
});

// ============================================================
// ========== نظام اللوق ==========
// ============================================================

async function logToChannel(guildId, data) {
  try {
    const config = await getGuildConfig(guildId);
    if (!config.logChannel) return;
    const channel = client.channels.cache.get(config.logChannel);
    if (!channel) return;
    const embed = new EmbedBuilder()
      .setColor(data.color || 0xcc0000)
      .setTitle(data.title || '📋 سجل')
      .setDescription(data.description || '')
      .setTimestamp();
    if (data.footer) embed.setFooter({ text: data.footer });
    if (data.fields) for (const f of data.fields) embed.addFields(f);
    if (data.thumbnail) embed.setThumbnail(data.thumbnail);
    if (data.image) embed.setImage(data.image);
    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error('خطأ في اللوق:', error);
  }
}

// ============================================================
// ========== نظام الترحيب ==========
// ============================================================

async function generateWelcomeImage(member, memberCount) {
  const canvas = createCanvas(1200, 600);
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, '#1a0000');
  gradient.addColorStop(0.5, '#4a0000');
  gradient.addColorStop(1, '#1a0000');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#ff0000';
  ctx.lineWidth = 6;
  const borderRadius = 20, x = 30, y = 30, w = canvas.width - 60, h = canvas.height - 60;
  ctx.beginPath();
  ctx.moveTo(x + borderRadius, y);
  ctx.lineTo(x + w - borderRadius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + borderRadius);
  ctx.lineTo(x + w, y + h - borderRadius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - borderRadius, y + h);
  ctx.lineTo(x + borderRadius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - borderRadius);
  ctx.lineTo(x, y + borderRadius);
  ctx.quadraticCurveTo(x, y, x + borderRadius, y);
  ctx.closePath();
  ctx.stroke();
  const avatarURL = member.user.displayAvatarURL({ extension: 'png', size: 256 });
  const avatar = await loadImage(avatarURL);
  const radius = 140, centerX = 250, centerY = 300;
  ctx.save();
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(avatar, centerX - radius, centerY - radius, radius * 2, radius * 2);
  ctx.restore();
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius + 6, 0, Math.PI * 2);
  ctx.strokeStyle = '#ff0000';
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(255,0,0,0.5)';
  ctx.shadowBlur = 10;
  ctx.font = 'bold 52px Arial';
  ctx.fillStyle = '#ffffff';
  ctx.shadowBlur = 15;
  ctx.fillText(`مرحباً ${member.user.username}`, 460, 190);
  ctx.font = '36px Arial';
  ctx.fillStyle = '#ff3333';
  ctx.shadowBlur = 10;
  ctx.fillText(`العضو رقم #${memberCount}`, 460, 270);
  ctx.font = '28px Arial';
  ctx.fillStyle = '#aaaaaa';
  ctx.shadowBlur = 5;
  ctx.fillText('نتمنى لك قضاء وقت ممتع في السيرفر! 🎉', 460, 340);
  ctx.textAlign = 'right';
  ctx.font = '22px Arial';
  ctx.fillStyle = '#ff0000';
  ctx.shadowBlur = 0;
  ctx.fillText('مرحباً بك', canvas.width - 50, canvas.height - 40);
  ctx.shadowBlur = 0;
  return canvas.toBuffer('image/png');
}

client.on('guildMemberAdd', async (member) => {
  try {
    const config = await getGuildConfig(member.guild.id);
    if (!config.welcomeChannel) return;
    const channel = member.guild.channels.cache.get(config.welcomeChannel);
    if (!channel) return;
    const memberCount = member.guild.memberCount;
    const imageBuffer = await generateWelcomeImage(member, memberCount);
    const generalImage = config.generalImage || config.bannerImage || member.guild.iconURL({ size: 1024 }) || null;
    const embed = new EmbedBuilder()
      .setTitle(config.welcomeTitle || '🔥 مرحباً بك في المجتمع')
      .setDescription(config.welcomeMessage || `أهلاً ${member} في السيرفر!`)
      .setColor(0xcc0000)
      .setImage('attachment://welcome.png')
      .setTimestamp();
    if (config.welcomeImage) embed.setThumbnail(config.welcomeImage);
    if (generalImage) embed.setFooter({ text: 'نتمنى لك قضاء وقت ممتع!', iconURL: generalImage });
    await channel.send({ content: `${member}`, embeds: [embed], files: [{ attachment: imageBuffer, name: 'welcome.png' }] });
    if (config.joinRole) {
      const role = member.guild.roles.cache.get(config.joinRole);
      if (role) await member.roles.add(role).catch(() => {});
    }
    await logToChannel(member.guild.id, {
      title: '👤 عضو جديد', color: 0xcc0000,
      description: `**${member.user.tag}** انضم إلى السيرفر.`,
      fields: [{ name: 'عدد الأعضاء', value: `${memberCount}`, inline: true }],
      thumbnail: member.user.displayAvatarURL(),
      footer: 'نظام الترحيب',
    });
  } catch (error) { console.error('خطأ في الترحيب:', error); }
});

client.on('guildMemberRemove', async (member) => {
  try {
    await logToChannel(member.guild.id, {
      title: '🚫 عضو غادر', color: 0xcc0000,
      description: `**${member.user.tag}** غادر السيرفر.`,
      thumbnail: member.user.displayAvatarURL(),
      footer: 'نظام الترحيب',
    });
  } catch (error) { console.error('خطأ في مغادرة العضو:', error); }
});

client.on('messageDelete', async (message) => {
  if (!message.guild || message.author?.bot) return;
  try {
    await logToChannel(message.guild.id, {
      title: '🗑️ حذف رسالة', color: 0xcc0000,
      description: `**المستخدم:** ${message.author?.tag || 'غير معروف'}\n**القناة:** ${message.channel.name}\n**المحتوى:** ${message.content || 'غير مرئي'}`,
      footer: 'سجلات الرسائل',
    });
  } catch (error) { console.error('خطأ في حذف الرسالة:', error); }
});

client.on('messageUpdate', async (oldMessage, newMessage) => {
  if (!oldMessage.guild || oldMessage.author?.bot) return;
  if (oldMessage.content === newMessage.content) return;
  try {
    await logToChannel(oldMessage.guild.id, {
      title: '✏️ تعديل رسالة', color: 0xcc0000,
      description: `**المستخدم:** ${oldMessage.author?.tag || 'غير معروف'}\n**القناة:** ${oldMessage.channel.name}`,
      fields: [
        { name: '📜 النص القديم', value: oldMessage.content || 'فارغ', inline: false },
        { name: '📝 النص الجديد', value: newMessage.content || 'فارغ', inline: false },
      ],
      footer: 'سجلات الرسائل',
    });
  } catch (error) { console.error('خطأ في تعديل الرسالة:', error); }
});

// ============================================================
// ========== نظام المستويات والاقتصاد (الرسائل) ==========
// ============================================================

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  if (message.content.startsWith('!')) return;

  const guildId = message.guild.id;
  const userId = message.author.id;

  try {
    // المستويات
    const config = await getGuildConfig(guildId);
    if (config.levelChannelId && message.channel.id !== config.levelChannelId) return;

    const userData = await getUserData(guildId, userId);
    userData.messages += 1;
    const gain = Math.floor(Math.random() * 15) + 5;
    userData.xp += gain;
    let currentLevel = userData.level;
    let requiredXP = getLevelXP(currentLevel);

    if (userData.xp >= requiredXP) {
      userData.level += 1;
      userData.xp = 0;
      await userData.save();

      // إرسال رسالة المستوى الجديد
      const levelChannelId = config.levelChannelId || message.channel.id;
      const levelChannel = message.guild.channels.cache.get(levelChannelId);
      if (levelChannel) {
        const embed = new EmbedBuilder()
          .setTitle('🎉 مستوى جديد!')
          .setDescription(`${message.author} وصل إلى المستوى **${userData.level}**!`)
          .setColor(0xcc0000)
          .setTimestamp();
        const generalImage = config.generalImage || config.bannerImage || message.guild.iconURL({ size: 1024 }) || null;
        if (generalImage) embed.setThumbnail(generalImage);
        await levelChannel.send({ embeds: [embed] });
      }

      // منح رتبة المستوى إذا كانت موجودة
      const levelRoleDoc = await LevelRole.findOne({ guildId, level: userData.level });
      if (levelRoleDoc) {
        const role = message.guild.roles.cache.get(levelRoleDoc.roleId);
        if (role) {
          const member = await message.guild.members.fetch(userId).catch(() => null);
          if (member) await member.roles.add(role).catch(() => {});
        }
      }
    } else {
      await userData.save();
    }

    // الاقتصاد (الرسائل)
    const eco = await getEconomy(guildId, userId);
    eco.messageCount += 1;
    if (eco.messageCount >= 30) {
      eco.messageCount = 0;
      eco.od += 15;
      await eco.save();
      // إرسال إشعار خاص
      try {
        const member = await message.guild.members.fetch(userId);
        const dmEmbed = new EmbedBuilder()
          .setTitle('💰 مكافأة OD')
          .setDescription(`حصلت على **15 OD** مقابل 30 رسالة في **${message.guild.name}**!\nرصيدك الحالي: **${eco.od} OD**`)
          .setColor(0x00ff00);
        await member.send({ embeds: [dmEmbed] }).catch(() => {});
      } catch (e) {}
    } else {
      await eco.save();
    }

    // ========== نظام الأوتو لاين ==========
    const auto = await getAutoLine(guildId);
    if (auto.enabled && auto.channelId && (auto.text || auto.image)) {
      const channel = client.channels.cache.get(auto.channelId) || await client.channels.fetch(auto.channelId).catch(() => null);
      if (channel && message.channel.id === channel.id) {
        try {
          if (auto.text && auto.image) {
            const embed = new EmbedBuilder().setDescription(auto.text).setColor(0xcc0000).setImage(auto.image).setTimestamp();
            await channel.send({ embeds: [embed] });
          } else if (auto.image) {
            const embed = new EmbedBuilder().setColor(0xcc0000).setImage(auto.image).setTimestamp();
            await channel.send({ embeds: [embed] });
          } else if (auto.text) {
            await channel.send(auto.text);
          }
        } catch (e) {}
        return; // لا ينفذ الردود التلقائية بعد الأوتو لاين
      }
    }

    // الردود التلقائية
    const autoReply = await findAutoReply(guildId, message.content);
    if (autoReply) {
      try {
        if (autoReply.image) {
          const embed = new EmbedBuilder().setDescription(autoReply.reply).setColor(0xcc0000).setImage(autoReply.image).setTimestamp();
          await message.reply({ embeds: [embed] });
        } else {
          await message.reply(autoReply.reply);
        }
      } catch (e) {
        await message.channel.send(autoReply.reply).catch(() => {});
      }
    }

  } catch (error) {
    console.error('خطأ في معالجة الرسالة:', error);
  }
});

// ============================================================
// ========== نظام الفويس والاقتصاد ==========
// ============================================================

const voiceTimeMap = new Map();

client.on('voiceStateUpdate', async (oldState, newState) => {
  const member = newState.member || oldState.member;
  if (!member || member.user.bot) return;
  const guildId = newState.guild.id;
  const userId = member.id;

  try {
    if (!oldState.channelId && newState.channelId) {
      // دخل روم صوتي
      voiceTimeMap.set(`${guildId}-${userId}`, Date.now());
    }

    if (oldState.channelId && !newState.channelId) {
      // خرج من روم صوتي
      const key = `${guildId}-${userId}`;
      const joinTime = voiceTimeMap.get(key);
      if (joinTime) {
        const seconds = Math.floor((Date.now() - joinTime) / 1000);
        const minutes = Math.floor(seconds / 60);
        if (minutes >= 1) {
          const eco = await getEconomy(guildId, userId);
          // حد أقصى 30 دقيقة لكل جلسة لمنع التضخم
          const reward = Math.min(minutes, 30);
          eco.od += reward;
          await eco.save();
          try {
            const dmEmbed = new EmbedBuilder()
              .setTitle('💰 مكافأة OD للفويس')
              .setDescription(`حصلت على **${reward} OD** مقابل ${reward} دقيقة في الروم الصوتي في **${oldState.guild.name}**!\nرصيدك الحالي: **${eco.od} OD**`)
              .setColor(0x00ff00);
            await member.send({ embeds: [dmEmbed] }).catch(() => {});
          } catch (e) {}
        }
        voiceTimeMap.delete(key);
      }
    }
  } catch (error) {
    console.error('خطأ في voiceStateUpdate:', error);
  }
});

// ============================================================
// ========== الأوامر النصية ==========
// ============================================================

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  if (!message.content.startsWith('!')) return;
  const args = message.content.slice(1).trim().split(/ +/);
  const cmd = args.shift().toLowerCase();
  const guildId = message.guild.id;
  const config = await getGuildConfig(guildId);
  const generalImage = config.generalImage || config.bannerImage || message.guild.iconURL({ size: 1024 }) || null;

  // حذف الأمر بعد 20 ثانية
  setTimeout(async () => { try { await message.delete(); } catch (e) {} }, 20000);

  try {

    // ========== الاقتصاد ==========
    if (cmd === 'رصيدي') {
      const eco = await getEconomy(guildId, message.author.id);
      const embed = new EmbedBuilder()
        .setTitle(`💰 رصيد ${message.author.username}`)
        .setDescription(`**${eco.od} OD**`)
        .setColor(0xcc0000);
      await message.channel.send({ embeds: [embed] });
      return;
    }

    if (cmd === 'توب') {
      const top = await Economy.find({ guildId }).sort({ od: -1 }).limit(10);
      if (!top.length) return message.reply('📭 لا يوجد أي شخص لديه OD حتى الآن.');
      let desc = '';
      let rank = 1;
      for (const entry of top) {
        const member = message.guild.members.cache.get(entry.userId);
        const name = member ? member.user.username : `مستخدم ${entry.userId}`;
        desc += `**#${rank}** ${name} - \`${entry.od} OD\`\n`;
        rank++;
      }
      const embed = new EmbedBuilder()
        .setTitle('🏆 ترتيب أغنى 10 أشخاص')
        .setDescription(desc)
        .setColor(0xcc0000)
        .setTimestamp();
      await message.channel.send({ embeds: [embed] });
      return;
    }

    if (cmd === 'اعطاء_عملات' || cmd === 'اعطاء_عمله') {
      // صلاحية: مالك، متحكم، أو رتبة الاقتصاد
      let hasEcoPerm = false;
      if (OWNER_ID && message.author.id === OWNER_ID) hasEcoPerm = true;
      if (!hasEcoPerm) hasEcoPerm = await isController(message.author.id, guildId);
      if (!hasEcoPerm && config.economyRole) {
        const role = message.member.roles.cache.get(config.economyRole);
        if (role) hasEcoPerm = true;
      }
      if (!hasEcoPerm) return message.reply('❌ تحتاج صلاحية رتبة الاقتصاد أو متحكم.');

      const target = message.mentions.members.first();
      const amount = parseInt(args[0]);
      if (!target || !amount || amount <= 0) {
        return message.reply('⚠️ الاستخدام: `!اعطاء_عملات @شخص <المبلغ>`');
      }
      if (target.user.bot) return message.reply('❌ لا يمكن إعطاء البوتات.');
      const eco = await getEconomy(guildId, target.id);
      eco.od += amount;
      await eco.save();
      const embed = new EmbedBuilder()
        .setTitle('✅ تم إعطاء العملات')
        .setDescription(`تم إعطاء <@${target.id}> **${amount} OD** بنجاح.\nرصيده الآن: **${eco.od} OD**`)
        .setColor(0x00ff00);
      await message.channel.send({ embeds: [embed] });
      try {
        const dmEmbed = new EmbedBuilder()
          .setTitle('💰 استلام OD')
          .setDescription(`تم إعطاؤك **${amount} OD** في **${message.guild.name}**!\nرصيدك الحالي: **${eco.od} OD**`)
          .setColor(0x00ff00);
        await target.send({ embeds: [dmEmbed] }).catch(() => {});
      } catch (e) {}
      return;
    }

    if (cmd === 'سحب_عملات' || cmd === 'سحب_عمله') {
      let hasEcoPerm = false;
      if (OWNER_ID && message.author.id === OWNER_ID) hasEcoPerm = true;
      if (!hasEcoPerm) hasEcoPerm = await isController(message.author.id, guildId);
      if (!hasEcoPerm && config.economyRole) {
        const role = message.member.roles.cache.get(config.economyRole);
        if (role) hasEcoPerm = true;
      }
      if (!hasEcoPerm) return message.reply('❌ تحتاج صلاحية رتبة الاقتصاد أو متحكم.');

      const target = message.mentions.members.first();
      const amount = parseInt(args[0]);
      if (!target || !amount || amount <= 0) {
        return message.reply('⚠️ الاستخدام: `!سحب_عملات @شخص <المبلغ>`');
      }
      if (target.user.bot) return message.reply('❌ لا يمكن السحب من البوتات.');
      const eco = await getEconomy(guildId, target.id);
      if (eco.od < amount) {
        return message.reply(`⚠️ رصيده غير كافٍ. لديه **${eco.od} OD** فقط.`);
      }
      eco.od -= amount;
      await eco.save();
      const embed = new EmbedBuilder()
        .setTitle('✅ تم سحب العملات')
        .setDescription(`تم سحب **${amount} OD** من <@${target.id}>.\nرصيده الآن: **${eco.od} OD**`)
        .setColor(0xff0000);
      await message.channel.send({ embeds: [embed] });
      return;
    }

    // ========== المساعدة ==========
    if (cmd === 'مساعدة') {
      const embed = new EmbedBuilder()
        .setTitle('📖 قائمة الأوامر')
        .setColor(0xcc0000)
        .addFields(
          { name: '👑 نظام التحكم', value: '`متحكم @شخص` `الغاء_متحكم @شخص` `قائمة_المتحكمين`', inline: false },
          { name: '🛡️ الإدارة', value: '`حظر` `طرد` `كتم` `فك_كتم` `تحذير` `ابطال_تحذيرات` `مسح` `قفل` `فتح`', inline: false },
          { name: '🎭 إدارة الرتب', value: '`اعطاء_رتبة` `سحب_رتبة` `عرض_رتب`', inline: false },
          { name: '📁 إدارة القنوات', value: '`انشاء_قناة` `حذف_قناة` `تغيير_اسم_قناة`', inline: false },
          { name: '🔊 إدارة الصوت', value: '`نقل_كل` `طرد_صوتي` `كتم_صوتي` `فك_كتم_صوتي`', inline: false },
          { name: '📌 إدارة الرسائل', value: '`تثبيت` `الغاء_تثبيت`', inline: false },
          { name: '📊 المستويات', value: '`مستوى` `ترتيب` `تعيين روم_ليفل #قناة`', inline: false },
          { name: '👋 الترحيب', value: '`تعيين ترحيب #قناة` `تعيين رسالة_ترحيب نص` `تعيين صورة_ترحيب رابط` `تعيين عنوان_ترحيب نص`', inline: false },
          { name: '📋 اللوق', value: '`تعيين سجلات #قناة` `اختبار_لوق`', inline: false },
          { name: '🤖 الأوتو لاين', value: '`تعيين اوتر_لاين #روم [نص]` `تعيين صورة_اوترلاين رابط` `تفعيل/تعطيل`', inline: false },
          { name: '💬 الردود التلقائية', value: '`رد_تلقائي كلمة رد` `رد_تلقائي_صورة كلمة رد رابط` `حذف_رد_تلقائي كلمة` `عرض_الردود`', inline: false },
          { name: '💡 الاقتراحات', value: '`بانل_اقتراح` (للمتحكمين) – ينشئ لوحة اقتراحات', inline: false },
          { name: '🎫 التذاكر', value: '`بانل` `عرض_تذكرة` `تعيين تذكرة` (للمتحكمين)', inline: false },
          { name: '🔔 رتب الإشعارات', value: '`رتب` (للمتحكمين)', inline: false },
          { name: '✏️ تغيير الاسم', value: '`تغيير_اسم`', inline: false },
          { name: 'ℹ️ معلومات', value: '`معلومات` `سيرفر` `بينق`', inline: false },
          { name: '⚙️ إعدادات', value: '`تعيين` (للمتحكمين)', inline: false },
          { name: '📸 إنستغرام', value: '`ig رابط_الريلز` – تحميل فيديو من إنستغرام', inline: false },
          { name: '💰 الاقتصاد', value: '`رصيدي` `توب` `اعطاء_عملات @شخص مبلغ` `سحب_عملات @شخص مبلغ`', inline: false }
        )
        .setFooter({ text: `🔥 البادئة: !` });
      if (generalImage) embed.setImage(generalImage);
      await message.channel.send({ embeds: [embed] });
      return;
    }

    // ========== أمر ig ==========
    if (cmd === 'ig') {
      const url = args[0];
      if (!url) return message.reply('⚠️ أدخل رابط الرقصة (ريلز) من إنستغرام.');
      const loadingMsg = await message.reply('⏳ جاري تحميل الفيديو...');
      try {
        const instagramGetUrl = require('instagram-url-direct');
        const result = await instagramGetUrl(url);
        const videoUrl = Array.isArray(result) ? result[0]?.url : result.url;
        if (!videoUrl) throw new Error('تعذر استخراج رابط الفيديو.');
        const response = await fetch(videoUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const buffer = Buffer.from(await response.arrayBuffer());
        await message.reply({ files: [{ attachment: buffer, name: 'reel.mp4' }] });
        await loadingMsg.delete().catch(() => {});
      } catch (error) {
        await loadingMsg.edit({ content: `❌ فشل التحميل: ${error.message}` }).catch(() => {});
      }
      return;
    }

    // ========== نظام التحكم ==========
    if (cmd === 'متحكم') {
      if (!OWNER_ID || message.author.id !== OWNER_ID) return message.reply('❌ هذا الأمر للمالك فقط.');
      const member = message.mentions.members.first();
      if (!member) return message.reply('⚠️ منشن العضو.');
      if (member.id === client.user.id) return message.reply('❌ لا يمكنني جعل نفسي متحكماً.');
      if (member.id === OWNER_ID) return message.reply('❌ هذا هو مالك البوت، يملك صلاحية مطلقة مسبقاً.');
      const isCtrl = await isController(member.id, guildId);
      if (isCtrl) return message.reply(`⚠️ ${member} متحكم بالفعل.`);
      await addController(guildId, member.id);
      await logToChannel(guildId, { title: '🛡️ تعيين متحكم', color: 0xcc0000, description: `**${message.author}** جعل ${member} متحكماً.` });
      await message.reply(`✅ تم جعل ${member} متحكماً على البوت في هذا السيرفر.`);
      return;
    }

    if (cmd === 'الغاء_متحكم') {
      if (!OWNER_ID || message.author.id !== OWNER_ID) return message.reply('❌ هذا الأمر للمالك فقط.');
      const member = message.mentions.members.first();
      if (!member) return message.reply('⚠️ منشن العضو.');
      if (member.id === OWNER_ID) return message.reply('❌ لا يمكن إزالة صلاحية مالك البوت.');
      const isCtrl = await isController(member.id, guildId);
      if (!isCtrl) return message.reply(`⚠️ ${member} ليس متحكماً.`);
      await removeController(guildId, member.id);
      await logToChannel(guildId, { title: '🛡️ إلغاء متحكم', color: 0xcc0000, description: `**${message.author}** ألغى صلاحية ${member}.` });
      await message.reply(`✅ تم إلغاء صلاحية التحكم عن ${member}.`);
      return;
    }

    if (cmd === 'قائمة_المتحكمين') {
      const controllers = await getControllers(guildId);
      if (!controllers.length) return message.reply('📋 لا يوجد متحكمون في هذا السيرفر.');
      const list = controllers.map(id => `<@${id}>`).join('\n');
      const embed = new EmbedBuilder().setTitle('🛡️ قائمة المتحكمين').setColor(0xcc0000).setDescription(list).setTimestamp();
      if (generalImage) embed.setImage(generalImage);
      await message.channel.send({ embeds: [embed] });
      return;
    }

    // ========== أمر "تعيين" ==========
    if (cmd === 'تعيين') {
      const hasPerm = await hasPermission(message.member, guildId);
      if (!hasPerm) return message.reply('❌ تحتاج صلاحية متحكم.');

      const sub = args[0]?.toLowerCase();
      const value = args.slice(1).join(' ');

      if (!sub) {
        const embed = new EmbedBuilder()
          .setTitle('⚙️ أوامر الإعدادات')
          .setColor(0xcc0000)
          .addFields(
            { name: '👋 الترحيب', value: '`ترحيب #قناة`، `رسالة_ترحيب نص`، `صورة_ترحيب رابط`، `عنوان_ترحيب نص`' },
            { name: '📋 اللوق', value: '`سجلات #قناة`' },
            { name: '📊 المستويات', value: '`روم_ليفل #قناة`' },
            { name: '🤖 الأوتو لاين', value: '`اوتر_لاين #قناة نص`، `صورة_اوترلاين رابط`، `تفعيل_اوترلاين`، `تعطيل_اوترلاين`' },
            { name: '🎫 التذاكر', value: '`تذكرة` (لإدارة الأقسام)' },
            { name: '🔔 رتب الإشعارات', value: '`صورة_رتب رابط`' },
            { name: '🖼️ عام', value: '`صورة_بنر رابط`، `صورة_عامة رابط`' },
            { name: '🚪 دور الدخول', value: '`دور_دخول @دور`' },
            { name: '💡 الاقتراحات', value: '`قناة_اقتراح #قناة`، `عنوان_اقتراح نص`، `وصف_اقتراح نص`، `لون_اقتراح #هيكس`، `صورة_اقتراح رابط`' },
            { name: '💰 الاقتصاد', value: '`رتبة_اقتصاد @رتبة`' }
          )
          .setFooter({ text: 'الصيغة: !تعيين [الخيار] [القيمة]' });
        if (generalImage) embed.setImage(generalImage);
        return message.channel.send({ embeds: [embed] });
      }

      // رتبة الاقتصاد
      if (sub === 'رتبة_اقتصاد') {
        const role = message.mentions.roles.first();
        if (!role) {
          await updateGuildConfig(guildId, { economyRole: null });
          return message.reply('✅ تم إزالة رتبة الاقتصاد.');
        }
        await updateGuildConfig(guildId, { economyRole: role.id });
        return message.reply(`✅ تم تعيين رتبة الاقتصاد إلى ${role}`);
      }

      // الترحيب
      if (sub === 'ترحيب') {
        const channel = message.mentions.channels.first();
        if (!channel) {
          await updateGuildConfig(guildId, { welcomeChannel: null });
          await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0xcc0000, description: `**${message.author}** ألغى قناة الترحيب.` });
          return message.reply('✅ تم إلغاء تحديد قناة الترحيب.');
        }
        await updateGuildConfig(guildId, { welcomeChannel: channel.id });
        await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0xcc0000, description: `**${message.author}** عيّن قناة الترحيب إلى ${channel}.` });
        return message.reply(`✅ تم تعيين قناة الترحيب إلى ${channel}`);
      }

      if (sub === 'رسالة_ترحيب') {
        if (!value) return message.reply('⚠️ أدخل نص الترحيب الجديد.');
        await updateGuildConfig(guildId, { welcomeMessage: value });
        await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0xcc0000, description: `**${message.author}** غيّر نص الترحيب إلى:\n${value}` });
        return message.reply(`✅ تم تعيين نص الترحيب:\n${value}`);
      }

      if (sub === 'صورة_ترحيب') {
        if (!value) {
          await updateGuildConfig(guildId, { welcomeImage: null });
          await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0xcc0000, description: `**${message.author}** ألغى صورة الترحيب.` });
          return message.reply('✅ تم إلغاء صورة الترحيب.');
        }
        await updateGuildConfig(guildId, { welcomeImage: value });
        await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0xcc0000, description: `**${message.author}** عيّن صورة الترحيب: ${value}` });
        return message.reply(`✅ تم تعيين صورة الترحيب: ${value}`);
      }

      if (sub === 'عنوان_ترحيب') {
        if (!value) return message.reply('⚠️ أدخل العنوان الجديد.');
        await updateGuildConfig(guildId, { welcomeTitle: value });
        await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0xcc0000, description: `**${message.author}** غيّر عنوان الترحيب إلى: "${value}"` });
        return message.reply(`✅ تم تعيين عنوان الترحيب: "${value}"`);
      }

      // اللوق
      if (sub === 'سجلات') {
        const channel = message.mentions.channels.first();
        if (!channel) {
          await updateGuildConfig(guildId, { logChannel: null });
          return message.reply('✅ تم إلغاء تعيين قناة اللوق.');
        }
        await updateGuildConfig(guildId, { logChannel: channel.id });
        await logToChannel(guildId, { title: '📋 تم تعيين قناة اللوق', color: 0xcc0000, description: `**${message.author}** عيّن قناة اللوق إلى ${channel}` });
        return message.reply(`✅ تم تعيين قناة اللوق إلى ${channel}`);
      }

      // روم الليفل
      if (sub === 'روم_ليفل') {
        const channel = message.mentions.channels.first();
        if (!channel) {
          await updateGuildConfig(guildId, { levelChannelId: null });
          await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0xcc0000, description: `**${message.author}** ألغى قناة الليفل.` });
          return message.reply('✅ تم إلغاء تحديد قناة الليفل.');
        }
        await updateGuildConfig(guildId, { levelChannelId: channel.id });
        await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0xcc0000, description: `**${message.author}** عيّن قناة الليفل إلى ${channel}.` });
        return message.reply(`✅ تم تعيين قناة الليفل إلى ${channel}`);
      }

      // الأوتو لاين
      if (sub === 'اوتر_لاين') {
        const channel = message.mentions.channels.first();
        if (!channel) return message.reply('⚠️ منشن الروم.');
        const text = args.slice(2).join(' ');
        await setAutoLine(guildId, { channelId: channel.id, text: text || null, enabled: true });
        await logToChannel(guildId, { title: '🤖 تعيين أوتو لاين', color: 0xcc0000, description: `**${message.author}** عيّن الأوتو لاين في ${channel}${text ? `:\n${text}` : ''}` });
        const embed = new EmbedBuilder()
          .setTitle('✅ تم تعيين الأوتو لاين')
          .setColor(0xcc0000)
          .setDescription(`**الروم:** ${channel}${text ? `\n**النص:** ${text}` : ''}`)
          .setFooter({ text: 'تم التفعيل تلقائياً.' });
        if (generalImage) embed.setImage(generalImage);
        await message.channel.send({ embeds: [embed] });
        return;
      }

      if (sub === 'صورة_اوترلاين') {
        if (!value) return message.reply('⚠️ أدخل رابط الصورة.');
        await setAutoLine(guildId, { image: value });
        await logToChannel(guildId, { title: '🖼️ تعيين صورة أوتو لاين', color: 0xcc0000, description: `**${message.author}** عيّن صورة الأوتو لاين: ${value}` });
        const embed = new EmbedBuilder()
          .setTitle('✅ تم تعيين صورة الأوتو لاين')
          .setColor(0xcc0000)
          .setDescription(`[رابط الصورة](${value})`)
          .setImage(value);
        if (generalImage) embed.setThumbnail(generalImage);
        await message.channel.send({ embeds: [embed] });
        return;
      }

      if (sub === 'تفعيل_اوترلاين') {
        await setAutoLine(guildId, { enabled: true });
        await logToChannel(guildId, { title: '✅ تفعيل أوتو لاين', color: 0xcc0000, description: `**${message.author}** فعّل الأوتو لاين.` });
        const embed = new EmbedBuilder()
          .setTitle('✅ تم تفعيل الأوتو لاين')
          .setColor(0xcc0000)
          .setDescription('تم تشغيل النظام. سيرد البوت تلقائياً في الروم المحدد.');
        if (generalImage) embed.setImage(generalImage);
        await message.channel.send({ embeds: [embed] });
        return;
      }

      if (sub === 'تعطيل_اوترلاين') {
        await setAutoLine(guildId, { enabled: false });
        await logToChannel(guildId, { title: '⏹️ تعطيل أوتو لاين', color: 0xcc0000, description: `**${message.author}** عطّل الأوتو لاين.` });
        const embed = new EmbedBuilder()
          .setTitle('⏹️ تم تعطيل الأوتو لاين')
          .setColor(0xcc0000)
          .setDescription('تم إيقاف النظام. لن يرد البوت تلقائياً حتى يتم تفعيله مرة أخرى.');
        if (generalImage) embed.setImage(generalImage);
        await message.channel.send({ embeds: [embed] });
        return;
      }

      // دور دخول
      if (sub === 'دور_دخول') {
        const role = message.mentions.roles.first();
        if (!role) return message.reply('⚠️ منشن الدور.');
        await updateGuildConfig(guildId, { joinRole: role.id });
        await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0xcc0000, description: `**${message.author}** عيّن دور الدخول إلى ${role.name}.` });
        return message.reply(`✅ تم تعيين دور الدخول إلى ${role}`);
      }

      // صورة بانل
      if (sub === 'صورة_بانل') {
        if (!value) return message.reply('⚠️ أدخل رابط الصورة.');
        await updateGuildConfig(guildId, { ticketPanelImage: value });
        await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0xcc0000, description: `**${message.author}** عيّن صورة البانل: ${value}` });
        return message.reply(`✅ تم تعيين صورة البانل: ${value}`);
      }

      // صورة رتب
      if (sub === 'صورة_رتب') {
        if (!value) return message.reply('⚠️ أدخل رابط الصورة.');
        await updateGuildConfig(guildId, { rolesImage: value });
        await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0xcc0000, description: `**${message.author}** عيّن صورة رتب الإشعارات: ${value}` });
        return message.reply(`✅ تم تعيين صورة رتب الإشعارات: ${value}`);
      }

      // صورة بنر
      if (sub === 'صورة_بنر') {
        if (!value) return message.reply('⚠️ أدخل رابط الصورة.');
        await updateGuildConfig(guildId, { bannerImage: value });
        await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0xcc0000, description: `**${message.author}** عيّن صورة البنر: ${value}` });
        return message.reply(`✅ تم تعيين صورة البنر: ${value}`);
      }

      // صورة عامة
      if (sub === 'صورة_عامة') {
        if (!value) return message.reply('⚠️ أدخل رابط الصورة.');
        await updateGuildConfig(guildId, { generalImage: value });
        await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0xcc0000, description: `**${message.author}** عيّن الصورة العامة: ${value}` });
        return message.reply(`✅ تم تعيين الصورة العامة: ${value}`);
      }

      // الاقتراحات
      if (sub === 'قناة_اقتراح') {
        const channel = message.mentions.channels.first();
        if (!channel) return message.reply('⚠️ منشن القناة.');
        await updateGuildConfig(guildId, { suggestionsChannel: channel.id });
        await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0xcc0000, description: `**${message.author}** عيّن قناة الاقتراحات إلى ${channel}` });
        return message.reply(`✅ تم تعيين قناة الاقتراحات إلى ${channel}`);
      }

      if (sub === 'عنوان_اقتراح') {
        if (!value) return message.reply('⚠️ أدخل العنوان.');
        await updateGuildConfig(guildId, { suggestionsTitle: value });
        await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0xcc0000, description: `**${message.author}** غيّر عنوان الاقتراحات إلى: "${value}"` });
        return message.reply(`✅ تم تعيين عنوان الاقتراحات: "${value}"`);
      }

      if (sub === 'وصف_اقتراح') {
        if (!value) return message.reply('⚠️ أدخل الوصف.');
        await updateGuildConfig(guildId, { suggestionsDescription: value });
        await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0xcc0000, description: `**${message.author}** غيّر وصف الاقتراحات إلى:\n${value}` });
        return message.reply(`✅ تم تعيين وصف الاقتراحات:\n${value}`);
      }

      if (sub === 'لون_اقتراح') {
        if (!value || !value.match(/^#[0-9a-fA-F]{6}$/)) return message.reply('⚠️ أدخل لوناً صحيحاً بصيغة Hex مثل `#ff0000`.');
        await updateGuildConfig(guildId, { suggestionsColor: value });
        await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0xcc0000, description: `**${message.author}** عيّن لون الاقتراحات إلى ${value}` });
        return message.reply(`✅ تم تعيين لون الاقتراحات: ${value}`);
      }

      if (sub === 'صورة_اقتراح') {
        if (!value) return message.reply('⚠️ أدخل رابط الصورة.');
        await updateGuildConfig(guildId, { suggestionsImage: value });
        await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0xcc0000, description: `**${message.author}** عيّن صورة الاقتراحات: ${value}` });
        return message.reply(`✅ تم تعيين صورة الاقتراحات: ${value}`);
      }

      // التذاكر (إدارة الأقسام)
      if (sub === 'تذكرة') {
        const settings = await getTicketSettings(guildId);
        const action = args[1]?.toLowerCase();
        const actionValue = args.slice(2).join(' ');

        if (!action) {
          const embed = new EmbedBuilder()
            .setTitle('⚙️ إدارة التذاكر')
            .setColor(0xcc0000)
            .addFields(
              { name: '➕ إضافة قسم', value: '`!تعيين تذكرة إضافة [الاسم] @دور :ايموجي:`\nمثال: `!تعيين تذكرة إضافة دعم فني @SupportRole 🛠️`' },
              { name: '🎨 تعيين إيموجي لقسم', value: '`!تعيين تذكرة تعيين_ايموجي [الاسم] :ايموجي:`' },
              { name: '➖ حذف قسم', value: '`!تعيين تذكرة حذف [الاسم]`' },
              { name: '📝 تغيير النص', value: '`!تعيين تذكرة نص [النص]`' },
              { name: '🖼️ تغيير الصورة', value: '`!تعيين تذكرة صورة [رابط]`' },
              { name: '👀 عرض الأقسام', value: '`!عرض_تذكرة`' }
            )
            .setFooter({ text: 'الأقسام الحالية: ' + settings.sections.map(s => `${s.emoji || '📌'} ${s.name}`).join(', ') });
          if (generalImage) embed.setImage(generalImage);
          return message.channel.send({ embeds: [embed] });
        }

        if (action === 'إضافة') {
          const parts = actionValue.match(/^(.+?)\s+<@&(\d+)>\s*(\S+)?$/);
          if (!parts) return message.reply('⚠️ الصيغة: `!تعيين تذكرة إضافة [الاسم] @دور :ايموجي:`\nمثال: `!تعيين تذكرة إضافة دعم فني @Support 🛠️`');
          const sectionName = parts[1].trim();
          const roleId = parts[2];
          const emoji = parts[3] || '📌';

          if (settings.sections.find(s => s.name === sectionName)) {
            return message.reply(`⚠️ قسم "${sectionName}" موجود بالفعل.`);
          }

          settings.sections.push({ name: sectionName, roleId, emoji });
          await settings.save();
          await logToChannel(guildId, { title: '🎫 إضافة قسم تذكرة', color: 0xcc0000, description: `**${message.author}** أضاف قسم **${sectionName}** مع دور <@&${roleId}> وإيموجي ${emoji}` });
          return message.reply(`✅ تم إضافة قسم **${sectionName}** مع دور <@&${roleId}> وإيموجي ${emoji}.`);
        }

        if (action === 'تعيين_ايموجي') {
          const parts = actionValue.match(/^(.+?)\s+(\S+)$/);
          if (!parts) return message.reply('⚠️ الصيغة: `!تعيين تذكرة تعيين_ايموجي [الاسم] :ايموجي:`');
          const sectionName = parts[1].trim();
          const emoji = parts[2];

          const section = settings.sections.find(s => s.name === sectionName);
          if (!section) return message.reply(`⚠️ قسم "${sectionName}" غير موجود.`);

          section.emoji = emoji;
          await settings.save();
          await logToChannel(guildId, { title: '🎨 تعيين إيموجي قسم', color: 0xcc0000, description: `**${message.author}** عيّن الإيموجي ${emoji} لقسم **${sectionName}**` });
          return message.reply(`✅ تم تعيين الإيموجي ${emoji} لقسم **${sectionName}**.`);
        }

        if (action === 'حذف') {
          const sectionName = actionValue.trim();
          const index = settings.sections.findIndex(s => s.name === sectionName);
          if (index === -1) return message.reply(`⚠️ قسم "${sectionName}" غير موجود.`);

          settings.sections.splice(index, 1);
          await settings.save();
          await logToChannel(guildId, { title: '🗑️ حذف قسم تذكرة', color: 0xcc0000, description: `**${message.author}** حذف قسم **${sectionName}**` });
          return message.reply(`✅ تم حذف قسم **${sectionName}**.`);
        }

        if (action === 'نص') {
          if (!actionValue) return message.reply('⚠️ أدخل النص الجديد.');
          settings.text = actionValue;
          await settings.save();
          await logToChannel(guildId, { title: '📝 تغيير نص التذاكر', color: 0xcc0000, description: `**${message.author}** غيّر نص التذاكر.` });
          return message.reply(`✅ تم تغيير نص التذاكر:\n${actionValue}`);
        }

        if (action === 'صورة') {
          if (!actionValue) return message.reply('⚠️ أدخل رابط الصورة.');
          settings.image = actionValue;
          await settings.save();
          await logToChannel(guildId, { title: '🖼️ تغيير صورة التذاكر', color: 0xcc0000, description: `**${message.author}** غيّر صورة التذاكر.` });
          return message.reply(`✅ تم تغيير صورة التذاكر: ${actionValue}`);
        }

        return message.reply('⚠️ أمر غير معروف. استخدم `!تعيين تذكرة` لعرض التعليمات.');
      }

      return message.reply('⚠️ خيار غير معروف. استخدم `!تعيين` لعرض القائمة.');
    }

    // ========== بانل الاقتراحات ==========
    if (cmd === 'بانل_اقتراح') {
      const hasPerm = await hasPermission(message.member, guildId);
      if (!hasPerm) return message.reply('❌ تحتاج صلاحية متحكم.');

      const color = parseInt(config.suggestionsColor?.replace('#', '') || 'cc0000', 16);
      const embed = new EmbedBuilder()
        .setTitle(config.suggestionsTitle || '💡 قناة الاقتراحات')
        .setDescription(config.suggestionsDescription || 'هل لديك فكرة لتطوير السيرفر؟ شاركنا اقتراحك!')
        .setColor(color)
        .setTimestamp()
        .setFooter({ text: `بواسطة ${message.author.tag}` });

      if (config.suggestionsImage) embed.setImage(config.suggestionsImage);
      if (generalImage) embed.setThumbnail(generalImage);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('suggest_modal')
          .setLabel('📝 تقديم اقتراح')
          .setStyle(ButtonStyle.Primary)
      );

      await message.channel.send({ embeds: [embed], components: [row] });
      await logToChannel(guildId, { title: '💡 إنشاء لوحة اقتراحات', color: 0xcc0000, description: `**${message.author}** أنشأ لوحة الاقتراحات.`, footer: 'الاقتراحات' });
      return message.reply('✅ تم إنشاء لوحة الاقتراحات.');
    }

    // ========== اختبار اللوق ==========
    if (cmd === 'اختبار_لوق') {
      const hasPerm = await hasPermission(message.member, guildId);
      if (!hasPerm) return message.reply('❌ تحتاج صلاحية متحكم.');
      if (!config.logChannel) return message.reply('⚠️ لم يتم تعيين قناة اللوق.');
      const channel = message.guild.channels.cache.get(config.logChannel);
      if (!channel) return message.reply('❌ قناة اللوق غير موجودة.');
      await logToChannel(guildId, {
        title: '🧪 اختبار اللوق', color: 0xcc0000,
        description: `✅ اللوق يعمل بنجاح!\n**المنفذ:** ${message.author}`,
        footer: 'رسالة اختبار',
      });
      return message.reply('✅ تم إرسال رسالة اختبار إلى قناة اللوق.');
    }

    // ========== مستوى ==========
    if (cmd === 'مستوى') {
      const member = message.mentions.members.first() || message.member;
      const userData = await getUserData(guildId, member.id);
      const embed = new EmbedBuilder()
        .setTitle(`📊 مستوى ${member.user.username}`)
        .setColor(0xcc0000)
        .addFields(
          { name: 'المستوى', value: `${userData.level}`, inline: true },
          { name: 'XP', value: `${userData.xp}/${getLevelXP(userData.level)}`, inline: true },
          { name: 'الرسائل', value: `${userData.messages}`, inline: true }
        );
      if (generalImage) embed.setImage(generalImage);
      await message.channel.send({ embeds: [embed] });
      return;
    }

    // ========== ترتيب ==========
    if (cmd === 'ترتيب') {
      const top = await UserData.find({ guildId }).sort({ level: -1, xp: -1 }).limit(10);
      if (!top.length) return message.reply('📭 لا توجد بيانات مستويات.');
      let desc = '';
      let rank = 1;
      for (const entry of top) {
        const member = message.guild.members.cache.get(entry.userId);
        const name = member ? member.user.username : `مستخدم ${entry.userId}`;
        desc += `#${rank} ${name} - المستوى ${entry.level} (XP: ${entry.xp})\n`;
        rank++;
      }
      const embed = new EmbedBuilder().setTitle('🏆 ترتيب المستويات').setColor(0xcc0000).setDescription(desc).setFooter({ text: 'أعلى 10 أعضاء' });
      if (generalImage) embed.setImage(generalImage);
      await message.channel.send({ embeds: [embed] });
      return;
    }

    // ========== قول ==========
    if (cmd === 'قول') {
      const text = args.join(' ');
      if (!text) return message.reply('⚠️ اكتب النص.');
      await message.channel.send(text);
      return;
    }

    // ========== ايمبد ==========
    if (cmd === 'ايمبد') {
      const fullText = args.join(' ');
      if (!fullText) return message.reply('⚠️ الصيغة: `!ايمبد [العنوان] ، [الوصف]`');
      const parts = fullText.split(/[،,]\s*/).map(s => s.trim());
      let title = 'بدون عنوان', description = fullText;
      if (parts.length >= 2) { title = parts[0]; description = parts.slice(1).join(' ، '); }
      const embed = new EmbedBuilder().setTitle(title).setDescription(description).setColor(0xcc0000).setTimestamp();
      const imageMatch = description.match(/(https?:\/\/[^\s]+\.(?:png|jpg|jpeg|gif|webp))/i);
      if (imageMatch) { embed.setImage(imageMatch[1]); embed.setDescription(description.replace(imageMatch[1], '').trim() || 'بدون وصف'); }
      if (generalImage) embed.setThumbnail(generalImage);
      await message.channel.send({ embeds: [embed] });
      return;
    }

    // ========== اعلان ==========
    if (cmd === 'اعلان') {
      const hasPerm = await hasPermission(message.member, guildId);
      if (!hasPerm) return message.reply('❌ تحتاج صلاحية متحكم.');
      let mentionType = 'everyone';
      let text = args.join(' ');
      if (args[0]?.toLowerCase() === 'here') { mentionType = 'here'; text = args.slice(1).join(' '); }
      if (!text) return message.reply('⚠️ اكتب نص الإعلان.');
      const embed = new EmbedBuilder().setTitle('📢 إعلان').setDescription(text).setColor(0xcc0000).setTimestamp().setFooter({ text: `بواسطة ${message.author.tag}` });
      if (generalImage) embed.setImage(generalImage);
      await message.channel.send({ content: mentionType === 'everyone' ? '@everyone' : '@here', embeds: [embed] });
      return;
    }

    // ========== الإدارة ==========
    if (cmd === 'حظر') {
      const hasPerm = await hasPermission(message.member, guildId);
      if (!hasPerm) return message.reply('❌ تحتاج صلاحية متحكم.');
      const member = message.mentions.members.first();
      if (!member) return message.reply('⚠️ منشن العضو.');
      const reason = args.join(' ') || 'لا يوجد سبب';
      await member.ban({ reason });
      const embed = new EmbedBuilder().setTitle('✅ تم الحظر').setColor(0xcc0000).setDescription(`${member.user.tag} تم حظره بسبب: ${reason}`);
      if (generalImage) embed.setImage(generalImage);
      await message.channel.send({ embeds: [embed] });
      await logToChannel(guildId, { title: '🔨 حظر', color: 0xcc0000, description: `**المنفذ:** ${message.author}\n**المستهدف:** ${member.user.tag}\n**السبب:** ${reason}` });
      return;
    }

    if (cmd === 'طرد') {
      const hasPerm = await hasPermission(message.member, guildId);
      if (!hasPerm) return message.reply('❌ تحتاج صلاحية متحكم.');
      const member = message.mentions.members.first();
      if (!member) return message.reply('⚠️ منشن العضو.');
      const reason = args.join(' ') || 'لا يوجد سبب';
      await member.kick(reason);
      const embed = new EmbedBuilder().setTitle('✅ تم الطرد').setColor(0xcc0000).setDescription(`${member.user.tag} تم طرده بسبب: ${reason}`);
      if (generalImage) embed.setImage(generalImage);
      await message.channel.send({ embeds: [embed] });
      await logToChannel(guildId, { title: '🚪 طرد', color: 0xcc0000, description: `**المنفذ:** ${message.author}\n**المستهدف:** ${member.user.tag}\n**السبب:** ${reason}` });
      return;
    }

    if (cmd === 'كتم') {
      const hasPerm = await hasPermission(message.member, guildId);
      if (!hasPerm) return message.reply('❌ تحتاج صلاحية متحكم.');
      const member = message.mentions.members.first();
      if (!member) return message.reply('⚠️ منشن العضو.');
      const reason = args.join(' ') || 'لا يوجد سبب';
      let muteRole = message.guild.roles.cache.find(r => r.name === 'Muted');
      if (!muteRole) {
        muteRole = await message.guild.roles.create({ name: 'Muted', permissions: [] });
        message.guild.channels.cache.forEach(ch => ch.permissionOverwrites.create(muteRole, { SendMessages: false }).catch(() => {}));
      }
      await member.roles.add(muteRole, reason);
      const embed = new EmbedBuilder().setTitle('🔇 تم الكتم').setColor(0xcc0000).setDescription(`${member.user.tag} تم كتمه بسبب: ${reason}`);
      if (generalImage) embed.setImage(generalImage);
      await message.channel.send({ embeds: [embed] });
      await logToChannel(guildId, { title: '🔇 كتم', color: 0xcc0000, description: `**المنفذ:** ${message.author}\n**المستهدف:** ${member.user.tag}\n**السبب:** ${reason}` });
      return;
    }

    if (cmd === 'فك_كتم') {
      const hasPerm = await hasPermission(message.member, guildId);
      if (!hasPerm) return message.reply('❌ تحتاج صلاحية متحكم.');
      const member = message.mentions.members.first();
      if (!member) return message.reply('⚠️ منشن العضو.');
      const muteRole = message.guild.roles.cache.find(r => r.name === 'Muted');
      if (!muteRole) return message.reply('⚠️ لا يوجد دور Muted في السيرفر.');
      await member.roles.remove(muteRole);
      const embed = new EmbedBuilder().setTitle('🔊 تم فك الكتم').setColor(0xcc0000).setDescription(`${member.user.tag} تم فك الكتم عنه.`);
      if (generalImage) embed.setImage(generalImage);
      await message.channel.send({ embeds: [embed] });
      await logToChannel(guildId, { title: '🔊 فك كتم', color: 0xcc0000, description: `**المنفذ:** ${message.author}\n**المستهدف:** ${member.user.tag}` });
      return;
    }

    if (cmd === 'تحذير') {
      const hasPerm = await hasPermission(message.member, guildId);
      if (!hasPerm) return message.reply('❌ تحتاج صلاحية متحكم.');
      const member = message.mentions.members.first();
      if (!member) return message.reply('⚠️ منشن العضو.');
      const reason = args.join(' ') || 'لا يوجد سبب';
      const count = await addWarn(guildId, member.id, reason, message.author.id);
      const embed = new EmbedBuilder().setTitle('⚠️ تحذير').setColor(0xcc0000).setDescription(`${member.user.tag} تم تحذيره بسبب: ${reason}\nإجمالي التحذيرات: ${count}`);
      if (generalImage) embed.setImage(generalImage);
      await message.channel.send({ embeds: [embed] });
      await logToChannel(guildId, { title: '⚠️ تحذير', color: 0xcc0000, description: `**المنفذ:** ${message.author}\n**المستهدف:** ${member.user.tag}\n**السبب:** ${reason}\n**عدد التحذيرات:** ${count}` });
      try {
        const dmEmbed = new EmbedBuilder().setTitle('⚠️ تم تحذيرك').setColor(0xcc0000)
          .setDescription(`**السيرفر:** ${message.guild.name}\n**السبب:** ${reason}\n**إجمالي تحذيراتك:** ${count}`)
          .setTimestamp().setFooter({ text: `بواسطة ${message.author.tag}` });
        if (generalImage) dmEmbed.setThumbnail(generalImage);
        await member.send({ embeds: [dmEmbed] });
      } catch (e) {}
      return;
    }

    if (cmd === 'ابطال_تحذيرات') {
      const hasPerm = await hasPermission(message.member, guildId);
      if (!hasPerm) return message.reply('❌ تحتاج صلاحية متحكم.');
      const member = message.mentions.members.first();
      if (!member) return message.reply('⚠️ منشن العضو.');
      await clearWarns(guildId, member.id);
      const embed = new EmbedBuilder().setTitle('✅ تم إبطال التحذيرات').setColor(0xcc0000).setDescription(`تم إلغاء كل تحذيرات ${member.user.tag}.`);
      if (generalImage) embed.setImage(generalImage);
      await message.channel.send({ embeds: [embed] });
      await logToChannel(guildId, { title: '✅ إبطال تحذيرات', color: 0xcc0000, description: `**المنفذ:** ${message.author}\n**المستهدف:** ${member.user.tag}` });
      return;
    }

    if (cmd === 'مسح') {
      const hasPerm = await hasPermission(message.member, guildId);
      if (!hasPerm) return message.reply('❌ تحتاج صلاحية متحكم.');
      let amount = parseInt(args[0]) || 5;
      if (amount > 100) amount = 100;
      const deleted = await message.channel.bulkDelete(amount, true).catch(() => {});
      const count = deleted ? deleted.size : 0;
      const msg = await message.channel.send(`🗑️ تم مسح ${count} رسالة.`);
      setTimeout(() => msg.delete().catch(() => {}), 5000);
      await logToChannel(guildId, { title: '🗑️ مسح رسائل', color: 0xcc0000, description: `**المنفذ:** ${message.author}\n**القناة:** ${message.channel.name}\n**عدد الرسائل:** ${count}` });
      return;
    }

    if (cmd === 'قفل') {
      const hasPerm = await hasPermission(message.member, guildId);
      if (!hasPerm) return message.reply('❌ تحتاج صلاحية متحكم.');
      await message.channel.permissionOverwrites.create(message.guild.id, { SendMessages: false });
      const embed = new EmbedBuilder().setTitle('🔒 تم قفل القناة').setColor(0xcc0000).setDescription(`تم قفل ${message.channel}`);
      if (generalImage) embed.setImage(generalImage);
      await message.channel.send({ embeds: [embed] });
      await logToChannel(guildId, { title: '🔒 قفل قناة', color: 0xcc0000, description: `**المنفذ:** ${message.author}\n**القناة:** ${message.channel.name}` });
      return;
    }

    if (cmd === 'فتح') {
      const hasPerm = await hasPermission(message.member, guildId);
      if (!hasPerm) return message.reply('❌ تحتاج صلاحية متحكم.');
      await message.channel.permissionOverwrites.delete(message.guild.id);
      const embed = new EmbedBuilder().setTitle('🔓 تم فتح القناة').setColor(0xcc0000).setDescription(`تم فتح ${message.channel}`);
      if (generalImage) embed.setImage(generalImage);
      await message.channel.send({ embeds: [embed] });
      await logToChannel(guildId, { title: '🔓 فتح قناة', color: 0xcc0000, description: `**المنفذ:** ${message.author}\n**القناة:** ${message.channel.name}` });
      return;
    }

    // ========== إدارة الرتب ==========
    if (cmd === 'اعطاء_رتبة') {
      const hasPerm = await hasPermission(message.member, guildId);
      if (!hasPerm) return message.reply('❌ تحتاج صلاحية متحكم.');
      const member = message.mentions.members.first();
      if (!member) return message.reply('⚠️ منشن العضو.');
      const role = message.mentions.roles.first();
      if (!role) return message.reply('⚠️ منشن الرتبة.');
      if (role.position >= message.member.roles.highest.position && !(OWNER_ID && message.author.id === OWNER_ID))
        return message.reply('❌ لا يمكنك إعطاء رتبة أعلى من رتبتك.');
      await member.roles.add(role);
      const embed = new EmbedBuilder().setTitle('✅ تم إعطاء الرتبة').setColor(0xcc0000).setDescription(`تم إعطاء ${member} رتبة ${role}`);
      if (generalImage) embed.setImage(generalImage);
      await message.channel.send({ embeds: [embed] });
      await logToChannel(guildId, { title: '🎭 إعطاء رتبة', color: 0xcc0000, description: `**المنفذ:** ${message.author}\n**المستهدف:** ${member.user.tag}\n**الرتبة:** ${role.name}` });
      return;
    }

    if (cmd === 'سحب_رتبة') {
      const hasPerm = await hasPermission(message.member, guildId);
      if (!hasPerm) return message.reply('❌ تحتاج صلاحية متحكم.');
      const member = message.mentions.members.first();
      if (!member) return message.reply('⚠️ منشن العضو.');
      const role = message.mentions.roles.first();
      if (!role) return message.reply('⚠️ منشن الرتبة.');
      if (role.position >= message.member.roles.highest.position && !(OWNER_ID && message.author.id === OWNER_ID))
        return message.reply('❌ لا يمكنك سحب رتبة أعلى من رتبتك.');
      await member.roles.remove(role);
      const embed = new EmbedBuilder().setTitle('✅ تم سحب الرتبة').setColor(0xcc0000).setDescription(`تم سحب رتبة ${role} من ${member}`);
      if (generalImage) embed.setImage(generalImage);
      await message.channel.send({ embeds: [embed] });
      await logToChannel(guildId, { title: '🎭 سحب رتبة', color: 0xcc0000, description: `**المنفذ:** ${message.author}\n**المستهدف:** ${member.user.tag}\n**الرتبة:** ${role.name}` });
      return;
    }

    if (cmd === 'عرض_رتب') {
      const member = message.mentions.members.first() || message.member;
      const roles = member.roles.cache.filter(r => r.id !== message.guild.id).map(r => r.toString()).join(' ') || 'لا يوجد رتب';
      const embed = new EmbedBuilder().setTitle(`🎭 رتب ${member.user.username}`).setColor(0xcc0000).setDescription(roles);
      if (generalImage) embed.setImage(generalImage);
      await message.channel.send({ embeds: [embed] });
      return;
    }

    // ========== إدارة القنوات ==========
    if (cmd === 'انشاء_قناة') {
      const hasPerm = await hasPermission(message.member, guildId);
      if (!hasPerm) return message.reply('❌ تحتاج صلاحية متحكم.');
      const name = args.join(' ');
      if (!name) return message.reply('⚠️ أدخل اسم القناة.');
      const channel = await message.guild.channels.create({ name, type: ChannelType.GuildText });
      const embed = new EmbedBuilder().setTitle('✅ تم إنشاء القناة').setColor(0xcc0000).setDescription(`تم إنشاء ${channel}`);
      if (generalImage) embed.setImage(generalImage);
      await message.channel.send({ embeds: [embed] });
      await logToChannel(guildId, { title: '📁 إنشاء قناة', color: 0xcc0000, description: `**المنفذ:** ${message.author}\n**القناة:** ${channel.name}` });
      return;
    }

    if (cmd === 'حذف_قناة') {
      const hasPerm = await hasPermission(message.member, guildId);
      if (!hasPerm) return message.reply('❌ تحتاج صلاحية متحكم.');
      const channel = message.mentions.channels.first();
      if (!channel) return message.reply('⚠️ منشن القناة.');
      const channelName = channel.name;
      await channel.delete();
      const embed = new EmbedBuilder().setTitle('🗑️ تم حذف القناة').setColor(0xcc0000).setDescription(`تم حذف ${channelName}`);
      if (generalImage) embed.setImage(generalImage);
      await message.channel.send({ embeds: [embed] });
      await logToChannel(guildId, { title: '🗑️ حذف قناة', color: 0xcc0000, description: `**المنفذ:** ${message.author}\n**القناة:** ${channelName}` });
      return;
    }

    if (cmd === 'تغيير_اسم_قناة') {
      const hasPerm = await hasPermission(message.member, guildId);
      if (!hasPerm) return message.reply('❌ تحتاج صلاحية متحكم.');
      const channel = message.mentions.channels.first();
      if (!channel) return message.reply('⚠️ منشن القناة.');
      const oldName = channel.name;
      const newName = args.slice(1).join(' ');
      if (!newName) return message.reply('⚠️ أدخل الاسم الجديد.');
      await channel.setName(newName);
      const embed = new EmbedBuilder().setTitle('✏️ تم تغيير اسم القناة').setColor(0xcc0000).setDescription(`تم تغيير اسم القناة إلى ${newName}`);
      if (generalImage) embed.setImage(generalImage);
      await message.channel.send({ embeds: [embed] });
      await logToChannel(guildId, { title: '✏️ تغيير اسم قناة', color: 0xcc0000, description: `**المنفذ:** ${message.author}\n**الاسم القديم:** ${oldName}\n**الاسم الجديد:** ${newName}` });
      return;
    }

    // ========== إدارة الرسائل ==========
    if (cmd === 'تثبيت') {
      const hasPerm = await hasPermission(message.member, guildId);
      if (!hasPerm) return message.reply('❌ تحتاج صلاحية متحكم.');
      const msgId = args[0];
      if (!msgId) return message.reply('⚠️ أدخل معرف الرسالة.');
      try {
        const msg = await message.channel.messages.fetch(msgId);
        await msg.pin();
        const embed = new EmbedBuilder().setTitle('📌 تم تثبيت الرسالة').setColor(0xcc0000).setDescription(`[رابط الرسالة](${msg.url})`);
        if (generalImage) embed.setImage(generalImage);
        await message.channel.send({ embeds: [embed] });
        await logToChannel(guildId, { title: '📌 تثبيت رسالة', color: 0xcc0000, description: `**المنفذ:** ${message.author}\n**القناة:** ${message.channel.name}\n[رابط الرسالة](${msg.url})` });
      } catch (e) { await message.reply('❌ حدث خطأ. تأكد من المعرف.'); }
      return;
    }

    if (cmd === 'الغاء_تثبيت') {
      const hasPerm = await hasPermission(message.member, guildId);
      if (!hasPerm) return message.reply('❌ تحتاج صلاحية متحكم.');
      const msgId = args[0];
      if (!msgId) return message.reply('⚠️ أدخل معرف الرسالة.');
      try {
        const msg = await message.channel.messages.fetch(msgId);
        await msg.unpin();
        const embed = new EmbedBuilder().setTitle('📌 تم إلغاء تثبيت الرسالة').setColor(0xcc0000).setDescription(`[رابط الرسالة](${msg.url})`);
        if (generalImage) embed.setImage(generalImage);
        await message.channel.send({ embeds: [embed] });
        await logToChannel(guildId, { title: '📌 إلغاء تثبيت رسالة', color: 0xcc0000, description: `**المنفذ:** ${message.author}\n**القناة:** ${message.channel.name}\n[رابط الرسالة](${msg.url})` });
      } catch (e) { await message.reply('❌ حدث خطأ. تأكد من المعرف.'); }
      return;
    }

    // ========== إدارة الصوت ==========
    if (cmd === 'نقل_كل') {
      const hasPerm = await hasPermission(message.member, guildId);
      if (!hasPerm) return message.reply('❌ تحتاج صلاحية متحكم.');
      const from = message.mentions.channels.first();
      const to = message.mentions.channels.last();
      if (!from || !to || from.type !== ChannelType.GuildVoice || to.type !== ChannelType.GuildVoice)
        return message.reply('⚠️ منشن رومين صوتيين: `!نقل_كل #من #إلى`');
      const members = from.members.filter(m => !m.user.bot);
      let count = 0;
      for (const m of members) { await m.voice.setChannel(to).catch(() => {}); count++; }
      const embed = new EmbedBuilder().setTitle('🔊 تم نقل الأعضاء').setColor(0xcc0000).setDescription(`تم نقل ${count} عضو من ${from} إلى ${to}`);
      if (generalImage) embed.setImage(generalImage);
      await message.channel.send({ embeds: [embed] });
      await logToChannel(guildId, { title: '🔊 نقل أعضاء صوتي', color: 0xcc0000, description: `**المنفذ:** ${message.author}\n**من:** ${from.name}\n**إلى:** ${to.name}\n**عدد الأعضاء:** ${count}` });
      return;
    }

    if (cmd === 'طرد_صوتي') {
      const hasPerm = await hasPermission(message.member, guildId);
      if (!hasPerm) return message.reply('❌ تحتاج صلاحية متحكم.');
      const member = message.mentions.members.first();
      if (!member) return message.reply('⚠️ منشن العضو.');
      if (!member.voice.channel) return message.reply('⚠️ هذا العضو ليس في روم صوتي.');
      await member.voice.disconnect();
      const embed = new EmbedBuilder().setTitle('🔊 تم طرد العضو من الصوت').setColor(0xcc0000).setDescription(`تم طرد ${member.user.tag} من الروم الصوتي.`);
      if (generalImage) embed.setImage(generalImage);
      await message.channel.send({ embeds: [embed] });
      await logToChannel(guildId, { title: '🔊 طرد من الصوت', color: 0xcc0000, description: `**المنفذ:** ${message.author}\n**المستهدف:** ${member.user.tag}` });
      return;
    }

    if (cmd === 'كتم_صوتي') {
      const hasPerm = await hasPermission(message.member, guildId);
      if (!hasPerm) return message.reply('❌ تحتاج صلاحية متحكم.');
      const member = message.mentions.members.first();
      if (!member) return message.reply('⚠️ منشن العضو.');
      if (!member.voice.channel) return message.reply('⚠️ هذا العضو ليس في روم صوتي.');
      await member.voice.setMute(true);
      const embed = new EmbedBuilder().setTitle('🔇 تم الكتم الصوتي').setColor(0xcc0000).setDescription(`تم كتم صوت ${member.user.tag} في الروم الصوتي.`);
      if (generalImage) embed.setImage(generalImage);
      await message.channel.send({ embeds: [embed] });
      await logToChannel(guildId, { title: '🔇 كتم صوتي', color: 0xcc0000, description: `**المنفذ:** ${message.author}\n**المستهدف:** ${member.user.tag}` });
      return;
    }

    if (cmd === 'فك_كتم_صوتي') {
      const hasPerm = await hasPermission(message.member, guildId);
      if (!hasPerm) return message.reply('❌ تحتاج صلاحية متحكم.');
      const member = message.mentions.members.first();
      if (!member) return message.reply('⚠️ منشن العضو.');
      if (!member.voice.channel) return message.reply('⚠️ هذا العضو ليس في روم صوتي.');
      await member.voice.setMute(false);
      const embed = new EmbedBuilder().setTitle('🔊 تم فك الكتم الصوتي').setColor(0xcc0000).setDescription(`تم فك كتم صوت ${member.user.tag} في الروم الصوتي.`);
      if (generalImage) embed.setImage(generalImage);
      await message.channel.send({ embeds: [embed] });
      await logToChannel(guildId, { title: '🔊 فك كتم صوتي', color: 0xcc0000, description: `**المنفذ:** ${message.author}\n**المستهدف:** ${member.user.tag}` });
      return;
    }

    // ========== معلومات ==========
    if (cmd === 'معلومات') {
      const member = message.mentions.members.first() || message.member;
      const embed = new EmbedBuilder().setTitle(`ℹ️ معلومات ${member.user.username}`).setColor(0xcc0000)
        .setThumbnail(member.user.displayAvatarURL())
        .addFields(
          { name: '🆔 المعرف', value: member.id, inline: true },
          { name: '📅 تاريخ الانضمام', value: member.joinedAt.toDateString(), inline: true },
          { name: '📅 تاريخ الحساب', value: member.user.createdAt.toDateString(), inline: true },
          { name: '🎭 أعلى رتبة', value: member.roles.highest.toString(), inline: true },
          { name: '🔊 في روم صوتي', value: member.voice.channel ? member.voice.channel.name : 'لا', inline: true }
        );
      if (generalImage) embed.setImage(generalImage);
      await message.channel.send({ embeds: [embed] });
      return;
    }

    if (cmd === 'سيرفر') {
      const embed = new EmbedBuilder().setTitle(message.guild.name).setColor(0xcc0000)
        .addFields(
          { name: '👥 الأعضاء', value: `${message.guild.memberCount}`, inline: true },
          { name: '💬 القنوات', value: `${message.guild.channels.cache.size}`, inline: true },
          { name: '👑 المالك', value: `<@${message.guild.ownerId}>`, inline: true }
        )
        .setThumbnail(message.guild.iconURL());
      if (generalImage) embed.setImage(generalImage);
      await message.channel.send({ embeds: [embed] });
      return;
    }

    if (cmd === 'بينق') {
      const embed = new EmbedBuilder().setColor(0xcc0000).setDescription(`🏓 البينق: ${client.ws.ping}ms`);
      if (generalImage) embed.setImage(generalImage);
      await message.channel.send({ embeds: [embed] });
      return;
    }

    // ========== عرض التذاكر ==========
    if (cmd === 'عرض_تذكرة') {
      const settings = await getTicketSettings(guildId);
      const embed = new EmbedBuilder().setTitle('📋 إعدادات التذاكر').setColor(0xcc0000)
        .setDescription(`**النص:** ${settings.text}`)
        .addFields(
          { name: '📌 الأقسام', value: settings.sections.map((s, i) => `${i+1}. ${s.emoji || '📌'} **${s.name}** ${s.roleId ? `<@&${s.roleId}>` : '(بدون دور)'}`).join('\n') || 'لا يوجد أقسام', inline: false },
          { name: '🖼️ الصورة', value: settings.image ? `[رابط](${settings.image})` : 'لا توجد صورة', inline: true }
        )
        .setFooter({ text: 'استخدم !تعيين تذكرة لإدارة الأقسام' });
      if (generalImage) embed.setImage(generalImage);
      await message.channel.send({ embeds: [embed] });
      return;
    }

    // ========== لوحة التذاكر ==========
    if (cmd === 'بانل') {
      const hasPerm = await hasPermission(message.member, guildId);
      if (!hasPerm) return message.reply('❌ تحتاج صلاحية متحكم.');
      const settings = await getTicketSettings(guildId);
      const imageUrl = settings.image || 'https://i.imgur.com/GkKqN3G.png';
      const embed = new EmbedBuilder().setTitle('🎫 تذاكر دعم فني').setDescription(settings.text).setColor(0xcc0000).setImage(imageUrl).setFooter({ text: 'سيتم إنشاء قناة خاصة بك وسيرد عليك الفريق.' });
      if (generalImage) embed.setThumbnail(generalImage);

      const options = settings.sections.map(s => ({
        label: s.name,
        value: s.name,
        emoji: s.emoji || '📌',
      }));

      if (!options.length) return message.reply('⚠️ لا توجد أقسام مضافة. استخدم `!تعيين تذكرة إضافة` لإضافة قسم.');

      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('ticket_menu')
          .setPlaceholder('📌 اختر القسم...')
          .addOptions(options)
      );

      await message.channel.send({ embeds: [embed], components: [row] });
      await logToChannel(guildId, { title: '🎫 إنشاء لوحة تذاكر', color: 0xcc0000, description: `**${message.author}** أنشأ لوحة تذاكر.` });
      return message.reply('✅ تم إنشاء لوحة التذاكر.');
    }

    // ========== رتب الإشعارات ==========
    if (cmd === 'رتب') {
      const hasPerm = await hasPermission(message.member, guildId);
      if (!hasPerm) return message.reply('❌ تحتاج صلاحية متحكم.');
      const defaultImage = 'https://i.imgur.com/7dXe7tM.png';
      const imageUrl = config.rolesImage || defaultImage;
      const embed = new EmbedBuilder().setTitle('🔔 رتب الإشعارات').setDescription('اختر الرتب التي تريد استلام إشعارات عنها من خلال الأزرار أدناه.').setColor(0xcc0000).setImage(imageUrl).setFooter({ text: 'اضغط مرة للحصول على الرتبة، ومرة أخرى لإزالتها.' });
      if (generalImage) embed.setThumbnail(generalImage);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('role_game').setLabel('🎮 Game Notice').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('role_event').setLabel('📅 Event Notice').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('role_ajr').setLabel('🔊 Ajr Notice').setStyle(ButtonStyle.Secondary)
      );
      await message.channel.send({ embeds: [embed], components: [row] });
      await logToChannel(guildId, { title: '🔔 إنشاء لوحة رتب الإشعارات', color: 0xcc0000, description: `**${message.author}** أنشأ لوحة رتب الإشعارات.` });
      return message.reply('✅ تم إنشاء لوحة الرتب.');
    }

    // ========== تغيير الاسم ==========
    if (cmd === 'تغيير_اسم') {
      const userId = message.author.id;
      // نستخدم قاعدة البيانات لتخزين الكول داون (نضيف حقل nameCooldown في GuildConfig أو نموذج منفصل)
      // لكن للتبسيط سنستخدم Map مؤقت (يفقد بعد إعادة التشغيل) - يمكن تحسينه لاحقاً
      // لكننا سنستخدم متغير عام في الذاكرة (كما في الكود الأصلي) لكن يمكن حفظه في DB
      const last = dbNameCooldown[userId] || 0;
      if (last && Date.now() - last < 5 * 60 * 60 * 1000) {
        const remaining = Math.ceil((5 * 60 * 60 * 1000 - (Date.now() - last)) / (60 * 60 * 1000));
        return message.reply(`⏳ يمكنك تغيير اسمك بعد ${remaining} ساعة.`);
      }
      const embed = new EmbedBuilder().setTitle('✏️ تغيير الاسم').setDescription('اضغط على الزر أدناه لتغيير اسمك المستعار في السيرفر.').setColor(0xcc0000).setFooter({ text: 'يمكنك تغيير اسمك مرة كل 5 ساعات.' });
      if (generalImage) embed.setImage(generalImage);
      const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('open_name_modal').setLabel('✏️ تغيير الاسم').setStyle(ButtonStyle.Secondary));
      await message.channel.send({ embeds: [embed], components: [row] });
      return;
    }

    // ========== الردود التلقائية ==========
    if (cmd === 'رد_تلقائي') {
      const hasPerm = await hasPermission(message.member, guildId);
      if (!hasPerm) return message.reply('❌ تحتاج صلاحية متحكم.');
      const keyword = args[0];
      const reply = args.slice(1).join(' ');
      if (!keyword || !reply) return message.reply('⚠️ الصيغة: `!رد_تلقائي [الكلمة] [الرد]`');
      const added = await addAutoReply(guildId, keyword, reply);
      await logToChannel(guildId, { title: '💬 إضافة رد تلقائي', color: 0xcc0000, description: `**${message.author}** أضاف رداً تلقائياً:\n**${keyword}** → ${reply}` });
      const embed = new EmbedBuilder()
        .setTitle(added ? '✅ تم إضافة رد تلقائي' : '🔄 تم تحديث رد تلقائي')
        .setColor(0xcc0000)
        .setDescription(`**الكلمة:** ${keyword}\n**الرد:** ${reply}`)
        .setFooter({ text: 'سيرد البوت تلقائياً عند كتابة هذه الكلمة.' });
      if (generalImage) embed.setImage(generalImage);
      await message.channel.send({ embeds: [embed] });
      return;
    }

    if (cmd === 'رد_تلقائي_صورة') {
      const hasPerm = await hasPermission(message.member, guildId);
      if (!hasPerm) return message.reply('❌ تحتاج صلاحية متحكم.');
      const keyword = args[0];
      const image = args[args.length - 1];
      const reply = args.slice(1, -1).join(' ');
      if (!keyword || !reply || !image) return message.reply('⚠️ الصيغة: `!رد_تلقائي_صورة [الكلمة] [الرد] [رابط_الصورة]`');
      if (!image.match(/^https?:\/\/.+/)) return message.reply('⚠️ الرابط غير صالح.');
      const added = await addAutoReply(guildId, keyword, reply, image);
      await logToChannel(guildId, { title: '💬 إضافة رد تلقائي مع صورة', color: 0xcc0000, description: `**${message.author}** أضاف رداً تلقائياً مع صورة:\n**${keyword}** → ${reply}` });
      const embed = new EmbedBuilder()
        .setTitle(added ? '✅ تم إضافة رد تلقائي مع صورة' : '🔄 تم تحديث رد تلقائي مع صورة')
        .setColor(0xcc0000)
        .setDescription(`**الكلمة:** ${keyword}\n**الرد:** ${reply}`)
        .setImage(image)
        .setFooter({ text: 'سيرد البوت مع الصورة تلقائياً.' });
      if (generalImage) embed.setThumbnail(generalImage);
      await message.channel.send({ embeds: [embed] });
      return;
    }

    if (cmd === 'حذف_رد_تلقائي') {
      const hasPerm = await hasPermission(message.member, guildId);
      if (!hasPerm) return message.reply('❌ تحتاج صلاحية متحكم.');
      const keyword = args.join(' ');
      if (!keyword) return message.reply('⚠️ اكتب الكلمة المفتاحية التي تريد حذفها.');
      const removed = await removeAutoReply(guildId, keyword);
      if (!removed) return message.reply(`⚠️ لا يوجد رد تلقائي للكلمة "${keyword}".`);
      await logToChannel(guildId, { title: '🗑️ حذف رد تلقائي', color: 0xcc0000, description: `**${message.author}** حذف الرد التلقائي للكلمة **${keyword}**` });
      const embed = new EmbedBuilder()
        .setTitle('🗑️ تم حذف الرد التلقائي')
        .setColor(0xcc0000)
        .setDescription(`تم حذف الرد التلقائي للكلمة: **${keyword}**`);
      if (generalImage) embed.setImage(generalImage);
      await message.channel.send({ embeds: [embed] });
      return;
    }

    if (cmd === 'عرض_الردود') {
      const replies = await getAutoReplies(guildId);
      if (!replies.length) return message.reply('📭 لا توجد ردود تلقائية في هذا السيرفر.');
      const list = replies.map((r, i) => `${i+1}. **${r.keyword}** → ${r.reply}${r.image ? ' (🖼️)' : ''}`).join('\n');
      const embed = new EmbedBuilder()
        .setTitle('💬 قائمة الردود التلقائية')
        .setColor(0xcc0000)
        .setDescription(list)
        .setFooter({ text: `عدد الردود: ${replies.length}` });
      if (generalImage) embed.setImage(generalImage);
      await message.channel.send({ embeds: [embed] });
      return;
    }

    // ========== إيقاف البوت ==========
    if (cmd === 'إيقاف') {
      if (!OWNER_ID || message.author.id !== OWNER_ID) return message.reply('❌ هذا الأمر للمالك فقط.');
      await message.reply('🛑 جاري الإيقاف...');
      process.exit(0);
      return;
    }

  } catch (error) {
    console.error('خطأ في تنفيذ الأمر:', error);
    await message.reply('❌ حدث خطأ أثناء تنفيذ الأمر.').catch(() => {});
  }
});

// ============================================================
// ========== معالج التفاعلات ==========
// ============================================================

client.on('interactionCreate', async (interaction) => {
  try {
    // مودال الاقتراح
    if (interaction.isButton() && interaction.customId === 'suggest_modal') {
      const modal = new ModalBuilder()
        .setCustomId('suggest_modal_submit')
        .setTitle('📝 تقديم اقتراح')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('suggest_title')
              .setLabel('عنوان الاقتراح')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setMinLength(3)
              .setMaxLength(100)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('suggest_desc')
              .setLabel('تفاصيل الاقتراح')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
              .setMinLength(10)
              .setMaxLength(1000)
          )
        );
      await interaction.showModal(modal);
    }

    if (interaction.isModalSubmit() && interaction.customId === 'suggest_modal_submit') {
      const title = interaction.fields.getTextInputValue('suggest_title');
      const desc = interaction.fields.getTextInputValue('suggest_desc');
      const guild = interaction.guild;
      const config = await getGuildConfig(guild.id);

      if (!config.suggestionsChannel) {
        return interaction.reply({
          content: '⚠️ لم يتم تعيين قناة للاقتراحات. اطلب من المشرفين استخدام `!تعيين قناة_اقتراح #قناة`.',
          ephemeral: true
        });
      }

      const channel = guild.channels.cache.get(config.suggestionsChannel);
      if (!channel) {
        return interaction.reply({ content: '❌ قناة الاقتراحات غير موجودة.', ephemeral: true });
      }

      const color = parseInt(config.suggestionsColor?.replace('#', '') || 'cc0000', 16);
      const embed = new EmbedBuilder()
        .setTitle(`💡 ${title}`)
        .setDescription(desc)
        .setColor(color)
        .setTimestamp()
        .setFooter({ text: `بواسطة ${interaction.user.tag} | ${interaction.user.id}` })
        .setThumbnail(interaction.user.displayAvatarURL());

      if (config.suggestionsImage) embed.setImage(config.suggestionsImage);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('suggest_accept')
          .setLabel('✅ قبول')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('suggest_reject')
          .setLabel('❌ رفض')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('suggest_comment')
          .setLabel('💬 تعليق')
          .setStyle(ButtonStyle.Secondary)
      );

      await channel.send({ content: `📩 اقتراح جديد من ${interaction.user}`, embeds: [embed], components: [row] });
      await interaction.reply({ content: '✅ تم إرسال اقتراحك بنجاح! شكراً لك.', ephemeral: true });

      await logToChannel(guild.id, {
        title: '💡 اقتراح جديد',
        color: 0xcc0000,
        description: `**المستخدم:** ${interaction.user.tag}\n**العنوان:** ${title}`,
        footer: 'الاقتراحات',
      });
    }

    // أزرار الاقتراحات
    if (interaction.isButton()) {
      if (['suggest_accept', 'suggest_reject', 'suggest_comment'].includes(interaction.customId)) {
        const hasPerm = await hasPermission(interaction.member, interaction.guild.id);
        if (!hasPerm) {
          return interaction.reply({ content: '❌ هذا الزر للمشرفين فقط.', ephemeral: true });
        }

        const msg = interaction.message;
        const embed = msg.embeds[0];
        if (!embed) return interaction.reply({ content: '❌ لا يوجد اقتراح.', ephemeral: true });

        let newEmbed = EmbedBuilder.from(embed);
        let action = '';
        let color = 0xcc0000;
        let footer = '';

        if (interaction.customId === 'suggest_accept') {
          action = '✅ تم قبول الاقتراح';
          color = 0x00ff00;
          footer = `قبل بواسطة ${interaction.user.tag}`;
        } else if (interaction.customId === 'suggest_reject') {
          action = '❌ تم رفض الاقتراح';
          color = 0xff0000;
          footer = `رفض بواسطة ${interaction.user.tag}`;
        } else if (interaction.customId === 'suggest_comment') {
          const modal = new ModalBuilder()
            .setCustomId('suggest_comment_modal')
            .setTitle('💬 تعليق على الاقتراح')
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId('comment_text')
                  .setLabel('التعليق')
                  .setStyle(TextInputStyle.Paragraph)
                  .setRequired(true)
                  .setMinLength(3)
                  .setMaxLength(500)
              )
            );
          await interaction.showModal(modal);
          return;
        }

        newEmbed.setColor(color).setFooter({ text: `${footer} | ${new Date().toISOString()}` });
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('suggest_comment')
            .setLabel('💬 تعليق')
            .setStyle(ButtonStyle.Secondary)
        );
        await interaction.update({ embeds: [newEmbed], components: [row] });
        await interaction.followUp({ content: `📌 ${action} بواسطة ${interaction.user}`, ephemeral: false });
      }

      // رتب الإشعارات
      if (['role_game', 'role_event', 'role_ajr'].includes(interaction.customId)) {
        const roleMap = { role_game: 'Game Notice', role_event: 'Event Notice', role_ajr: 'Ajr Notice' };
        const roleName = roleMap[interaction.customId];
        const role = interaction.guild.roles.cache.find(r => r.name === roleName);
        if (!role) return interaction.reply({ content: `❌ رتبة "${roleName}" غير موجودة.`, ephemeral: true });
        const member = interaction.member;
        if (member.roles.cache.has(role.id)) {
          await member.roles.remove(role);
          await interaction.reply({ content: `✅ تم إزالة رتبة ${roleName}.`, ephemeral: true });
        } else {
          await member.roles.add(role);
          await interaction.reply({ content: `✅ تم منحك رتبة ${roleName}.`, ephemeral: true });
        }
      }

      // زر تغيير الاسم
      if (interaction.customId === 'open_name_modal') {
        const userId = interaction.user.id;
        const last = dbNameCooldown[userId] || 0;
        if (last && Date.now() - last < 5 * 60 * 60 * 1000) {
          const remaining = Math.ceil((5 * 60 * 60 * 1000 - (Date.now() - last)) / (60 * 60 * 1000));
          return interaction.reply({ content: `⏳ يمكنك تغيير اسمك بعد ${remaining} ساعة.`, ephemeral: true });
        }
        const modal = new ModalBuilder().setCustomId('name_change_modal').setTitle('تغيير الاسم')
          .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('new_name').setLabel('الاسم الجديد').setStyle(TextInputStyle.Short).setRequired(true).setMinLength(2).setMaxLength(32)));
        await interaction.showModal(modal);
      }

      // زر إغلاق التذكرة
      if (interaction.customId === 'close_ticket') {
        const channel = interaction.channel;
        if (!channel.name.startsWith('تذكرة-')) return interaction.reply({ content: '⚠️ هذه ليست قناة تذكرة.', ephemeral: true });
        let ticketOwnerId = null, createdDate = new Date(), messageCount = 0;
        try {
          const messages = await channel.messages.fetch({ limit: 1 });
          const firstMsg = messages.first();
          if (firstMsg && firstMsg.mentions.users.first()) ticketOwnerId = firstMsg.mentions.users.first().id;
          if (firstMsg) createdDate = firstMsg.createdAt;
          const allMsgs = await channel.messages.fetch({ limit: 100 });
          messageCount = allMsgs.size;
        } catch (e) {}
        const sectionName = channel.name.replace('تذكرة-', '').split('-')[0] || 'غير معروف';
        const embed = new EmbedBuilder().setTitle('📋 ملخص التذكرة المغلقة').setColor(0xcc0000)
          .addFields(
            { name: '📌 القسم', value: sectionName, inline: true },
            { name: '👤 صاحب التذكرة', value: ticketOwnerId ? `<@${ticketOwnerId}>` : 'غير معروف', inline: true },
            { name: '🆔 معرف القناة', value: channel.id, inline: true },
            { name: '📅 تاريخ الإنشاء', value: createdDate.toLocaleString('ar-EG'), inline: true },
            { name: '💬 عدد الرسائل', value: `${messageCount}`, inline: true },
            { name: '🔒 أغلق بواسطة', value: `${interaction.user}`, inline: true }
          )
          .setTimestamp().setFooter({ text: 'تم إغلاق التذكرة' });
        if (ticketOwnerId) {
          try { const owner = await interaction.guild.members.fetch(ticketOwnerId); if (owner) await owner.send({ embeds: [embed] }).catch(() => {}); } catch (e) {}
        }
        await logToChannel(interaction.guild.id, { title: '🔒 إغلاق تذكرة', color: 0xcc0000, description: `**المستخدم:** ${interaction.user}\n**القناة:** ${channel.name}\n**صاحب التذكرة:** ${ticketOwnerId ? `<@${ticketOwnerId}>` : 'غير معروف'}`, footer: 'نظام التذاكر' });
        await interaction.reply({ content: '🔒 جاري إغلاق التذكرة...', ephemeral: true });
        setTimeout(async () => { await channel.delete().catch(() => {}); }, 3000);
      }
    }

    // مودال تغيير الاسم
    if (interaction.isModalSubmit() && interaction.customId === 'name_change_modal') {
      const newName = interaction.fields.getTextInputValue('new_name');
      if (newName.length < 2 || newName.length > 32) return interaction.reply({ content: '⚠️ الاسم يجب أن يكون بين 2 و 32 حرفاً.', ephemeral: true });
      try {
        const oldName = interaction.member.displayName;
        await interaction.member.setNickname(newName);
        dbNameCooldown[interaction.user.id] = Date.now();
        await logToChannel(interaction.guild.id, { title: '✏️ تغيير اسم', color: 0xcc0000, description: `**المستخدم:** ${interaction.user}\n**الاسم القديم:** ${oldName}\n**الاسم الجديد:** ${newName}`, footer: 'تغيير الاسم' });
        await interaction.reply({ content: `✅ تم تغيير اسمك إلى **${newName}**`, ephemeral: true });
      } catch (error) { await interaction.reply({ content: '❌ لا أملك صلاحية تغيير اسمك.', ephemeral: true }); }
    }

    // مودال التعليق على الاقتراح
    if (interaction.isModalSubmit() && interaction.customId === 'suggest_comment_modal') {
      const comment = interaction.fields.getTextInputValue('comment_text');
      const msg = interaction.message;
      const embed = msg.embeds[0];
      if (!embed) return interaction.reply({ content: '❌ لا يوجد اقتراح.', ephemeral: true });

      const newEmbed = EmbedBuilder.from(embed);
      newEmbed.addFields({ name: '💬 تعليق من الإدارة', value: comment, inline: false });
      newEmbed.setColor(0xffaa00).setFooter({ text: `علق بواسطة ${interaction.user.tag} | ${new Date().toISOString()}` });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('suggest_accept')
          .setLabel('✅ قبول')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('suggest_reject')
          .setLabel('❌ رفض')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('suggest_comment')
          .setLabel('💬 تعليق')
          .setStyle(ButtonStyle.Secondary)
      );

      await interaction.update({ embeds: [newEmbed], components: [row] });
      await interaction.followUp({ content: `💬 تم إضافة تعليق بواسطة ${interaction.user}`, ephemeral: false });
    }

    // ========== قائمة التذاكر ==========
    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_menu') {
      await interaction.deferReply({ ephemeral: true });
      const selected = interaction.values[0];
      const guild = interaction.guild;
      const member = interaction.member;
      const config = await getGuildConfig(guild.id);
      const generalImage = config.generalImage || config.bannerImage || guild.iconURL({ size: 1024 }) || null;
      const settings = await getTicketSettings(guild.id);
      const section = settings.sections.find(s => s.name === selected);
      if (!section) return interaction.editReply({ content: '❌ القسم غير موجود.', ephemeral: true });
      const ticketName = `تذكرة-${member.user.username}`.slice(0, 32);
      try {
        const channel = await guild.channels.create({
          name: ticketName, type: ChannelType.GuildText, parent: null,
          permissionOverwrites: [
            { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: member.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
            { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] }
          ]
        });
        const embed = new EmbedBuilder().setTitle(`🎫 تذكرة - ${selected}`).setDescription(`مرحباً ${member}!\nالقسم: **${selected}**\nيرجى شرح مشكلتك، سيرد عليك فريق الدعم قريباً.`).setColor(0xcc0000).setTimestamp();
        if (generalImage) embed.setImage(generalImage);
        let mention = section.roleId ? `${guild.roles.cache.get(section.roleId)}` : '';
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('close_ticket').setLabel('🔒 إغلاق التذكرة').setStyle(ButtonStyle.Secondary));
        await channel.send({ content: `${member} ${mention}`.trim(), embeds: [embed], components: [row] });
        await logToChannel(guild.id, { title: '🎫 فتح تذكرة', color: 0xcc0000, description: `**${member.user.tag}** فتح تذكرة في قسم **${selected}**\nالقناة: ${channel}`, footer: 'نظام التذاكر' });
        await interaction.editReply({ content: `✅ تم إنشاء تذكرتك: ${channel}`, ephemeral: true });
      } catch (error) { await interaction.editReply({ content: '❌ حدث خطأ في إنشاء التذكرة.', ephemeral: true }); }
    }

  } catch (error) {
    console.error('خطأ في معالج التفاعلات:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: '❌ حدث خطأ.', ephemeral: true }).catch(() => {});
    }
  }
});

// ============================================================
// ========== متغيرات مؤقتة للكول داون ==========
// ============================================================
const dbNameCooldown = {};

// ============================================================
// ========== تشغيل البوت ==========
// ============================================================

client.login(TOKEN).catch((err) => {
  console.error('❌ فشل تسجيل الدخول:', err);
  process.exit(1);
});
