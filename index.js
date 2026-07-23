// ============================================================
// البوت - ثيم داكن - خلفية ترحيب قابلة للتخصيص - MongoDB
// ============================================================

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
const MONGO_URL = process.env.MONGO_URL;
const OWNER_ID = process.env.OWNER_ID || null;

if (!TOKEN) {
  console.error('❌ تأكد من وجود DISCORD_TOKEN في متغيرات البيئة.');
  process.exit(1);
}
if (!MONGO_URL) {
  console.error('❌ تأكد من وجود MONGO_URL في متغيرات البيئة.');
  process.exit(1);
}

// ========== اتصال MongoDB ==========
mongoose.connect(MONGO_URL)
  .then(() => console.log('✅ اتصال MongoDB ناجح'))
  .catch(err => {
    console.error('❌ فشل اتصال MongoDB:', err);
    process.exit(1);
  });

// ============================================================
// ========== نماذج MongoDB ==========
// ============================================================

const ConfigSchema = new mongoose.Schema({
  guildId: { type: String, unique: true, required: true },
  logChannel: String,
  welcomeChannel: String,
  welcomeMessage: { type: String, default: 'أهلاً بك في السيرفر! 🎉' },
  welcomeTitle: { type: String, default: '🔥 مرحباً بك في المجتمع' },
  welcomeImage: String,
  welcomeBackground: String,
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
  suggestionsColor: { type: String, default: '#2b2d31' },
  suggestionsImage: String,
}, { timestamps: true });
const Config = mongoose.model('Config', ConfigSchema);

const UserSchema = new mongoose.Schema({
  guildId: String,
  userId: String,
  xp: { type: Number, default: 0 },
  level: { type: Number, default: 0 },
  messages: { type: Number, default: 0 },
}, { timestamps: true });
UserSchema.index({ guildId: 1, userId: 1 }, { unique: true });
const User = mongoose.model('User', UserSchema);

const EconomySchema = new mongoose.Schema({
  guildId: String,
  userId: String,
  og: { type: Number, default: 0 },
  messageCount: { type: Number, default: 0 },
  voiceSeconds: { type: Number, default: 0 },
  lastVoiceJoin: Date,
}, { timestamps: true });
EconomySchema.index({ guildId: 1, userId: 1 }, { unique: true });
const Economy = mongoose.model('Economy', EconomySchema);

const WarnSchema = new mongoose.Schema({
  guildId: String,
  userId: String,
  reason: String,
  moderator: String,
  date: { type: Date, default: Date.now },
});
const Warn = mongoose.model('Warn', WarnSchema);

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
const TicketSettings = mongoose.model('TicketSettings', TicketSettingsSchema);

const AutoLineSchema = new mongoose.Schema({
  guildId: { type: String, required: true },
  channelId: { type: String, required: true },
  text: String,
  image: String,
  enabled: { type: Boolean, default: false },
});
AutoLineSchema.index({ guildId: 1, channelId: 1 }, { unique: true });
const AutoLine = mongoose.model('AutoLine', AutoLineSchema);

const AutoReplySchema = new mongoose.Schema({
  guildId: String,
  keyword: String,
  reply: String,
  image: String,
});
AutoReplySchema.index({ guildId: 1, keyword: 1 }, { unique: true });
const AutoReply = mongoose.model('AutoReply', AutoReplySchema);

const LevelRoleSchema = new mongoose.Schema({
  guildId: String,
  level: Number,
  roleId: String,
});
LevelRoleSchema.index({ guildId: 1, level: 1 }, { unique: true });
const LevelRole = mongoose.model('LevelRole', LevelRoleSchema);

const ControllerSchema = new mongoose.Schema({
  guildId: String,
  userId: String,
});
ControllerSchema.index({ guildId: 1, userId: 1 }, { unique: true });
const Controller = mongoose.model('Controller', ControllerSchema);

const NameCooldownSchema = new mongoose.Schema({
  userId: { type: String, unique: true, required: true },
  timestamp: { type: Date, default: Date.now },
});
const NameCooldown = mongoose.model('NameCooldown', NameCooldownSchema);

// ============================================================
// ========== دوال مساعدة ==========
// ============================================================

async function getGuildConfig(guildId) {
  let config = await Config.findOne({ guildId });
  if (!config) {
    config = new Config({ guildId });
    await config.save();
  }
  return config;
}

async function updateGuildConfig(guildId, data) {
  await Config.findOneAndUpdate({ guildId }, data, { upsert: true, new: true });
}

async function getUserData(guildId, userId) {
  let data = await User.findOne({ guildId, userId });
  if (!data) {
    data = new User({ guildId, userId });
    await data.save();
  }
  return data;
}

async function getEconomy(guildId, userId) {
  let eco = await Economy.findOne({ guildId, userId });
  if (!eco) {
    eco = new Economy({ guildId, userId });
    await eco.save();
  }
  return eco;
}

async function getTicketSettings(guildId) {
  let settings = await TicketSettings.findOne({ guildId });
  if (!settings) {
    settings = new TicketSettings({ guildId });
    await settings.save();
  }
  return settings;
}

async function saveTicketSettings(guildId, data) {
  await TicketSettings.findOneAndUpdate({ guildId }, data, { upsert: true });
}

async function getAutoLine(guildId, channelId) {
  let auto = await AutoLine.findOne({ guildId, channelId });
  if (!auto) {
    auto = new AutoLine({ guildId, channelId });
    await auto.save();
  }
  return auto;
}

async function setAutoLine(guildId, channelId, data) {
  await AutoLine.findOneAndUpdate({ guildId, channelId }, data, { upsert: true });
}

async function deleteAutoLine(guildId, channelId) {
  await AutoLine.deleteOne({ guildId, channelId });
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
    return false;
  }
  const newReply = new AutoReply({ guildId, keyword, reply, image });
  await newReply.save();
  return true;
}

async function removeAutoReply(guildId, keyword) {
  const result = await AutoReply.deleteOne({ guildId, keyword: { $regex: new RegExp(`^${keyword}$`, 'i') } });
  return result.deletedCount > 0;
}

async function findAutoReply(guildId, content) {
  const replies = await AutoReply.find({ guildId });
  return replies.find(r => content.toLowerCase().includes(r.keyword.toLowerCase()));
}

async function getWarns(guildId, userId) {
  return await Warn.find({ guildId, userId });
}

async function addWarn(guildId, userId, reason, moderator) {
  const warn = new Warn({ guildId, userId, reason, moderator });
  await warn.save();
  return await Warn.countDocuments({ guildId, userId });
}

async function clearWarns(guildId, userId) {
  await Warn.deleteMany({ guildId, userId });
}

async function isController(userId, guildId) {
  if (OWNER_ID && userId === OWNER_ID) return true;
  const c = await Controller.findOne({ guildId, userId });
  return !!c;
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

async function setNameCooldown(userId) {
  await NameCooldown.findOneAndUpdate({ userId }, { timestamp: new Date() }, { upsert: true });
}

async function getNameCooldown(userId) {
  const cd = await NameCooldown.findOne({ userId });
  return cd ? cd.timestamp : null;
}

function getGeneralImage(guild, config) {
  if (config.generalImage) return config.generalImage;
  if (config.bannerImage) return config.bannerImage;
  if (guild.iconURL()) return guild.iconURL({ size: 1024 });
  return null;
}

// ========== العميل ==========
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

client.once('ready', () => {
  console.log(`✅ البوت جاهز باسم ${client.user.tag}`);
  if (OWNER_ID) console.log(`👑 صاحب البوت: ${OWNER_ID}`);
  client.user.setActivity('The Kingdom Never Falls.', { type: ActivityType.Watching });
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
      .setColor(data.color || 0x2b2d31)
      .setTitle(data.title || '📋 سجل')
      .setDescription(data.description || '')
      .setTimestamp();
    if (data.footer) embed.setFooter({ text: data.footer });
    if (data.fields) for (const f of data.fields) embed.addFields(f);
    if (data.thumbnail) embed.setThumbnail(data.thumbnail);
    if (data.image) embed.setImage(data.image);
    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error('❌ خطأ في اللوق:', error);
  }
}

// ============================================================
// ========== دالة الخلفية الافتراضية للترحيب ==========
// ============================================================

function drawDefaultBackground(ctx, width, height) {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#2b2d31');
  gradient.addColorStop(0.5, '#1e1e1e');
  gradient.addColorStop(1, '#2b2d31');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

// ============================================================
// ========== نظام الترحيب ==========
// ============================================================

async function generateWelcomeImage(member, memberCount, background = null) {
  const width = 1200;
  const height = 600;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  if (background) {
    if (background.match(/^https?:\/\/.+\.(png|jpg|jpeg|gif|webp)/i)) {
      try {
        const bgImage = await loadImage(background);
        ctx.drawImage(bgImage, 0, 0, width, height);
      } catch (e) {
        drawDefaultBackground(ctx, width, height);
      }
    } else {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);
    }
  } else {
    drawDefaultBackground(ctx, width, height);
  }

  ctx.strokeStyle = '#666666';
  ctx.lineWidth = 6;
  const borderRadius = 20;
  const x = 30, y = 30, w = width - 60, h = height - 60;
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
  const radius = 140;
  const centerX = 250, centerY = 300;
  ctx.save();
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(avatar, centerX - radius, centerY - radius, radius * 2, radius * 2);
  ctx.restore();
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius + 6, 0, Math.PI * 2);
  ctx.strokeStyle = '#888888';
  ctx.lineWidth = 6;
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = 10;
  ctx.font = 'bold 52px Arial';
  ctx.fillStyle = '#ffffff';
  ctx.shadowBlur = 15;
  ctx.fillText(`مرحباً ${member.user.username}`, 460, 190);
  ctx.font = '36px Arial';
  ctx.fillStyle = '#cccccc';
  ctx.shadowBlur = 10;
  ctx.fillText(`العضو رقم #${memberCount}`, 460, 270);
  ctx.font = '28px Arial';
  ctx.fillStyle = '#aaaaaa';
  ctx.shadowBlur = 5;
  ctx.fillText('نتمنى لك قضاء وقت ممتع في السيرفر! 🎉', 460, 340);
  ctx.textAlign = 'right';
  ctx.font = '22px Arial';
  ctx.fillStyle = '#999999';
  ctx.shadowBlur = 0;
  ctx.fillText('مرحباً بك', width - 50, height - 40);
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
    const imageBuffer = await generateWelcomeImage(member, memberCount, config.welcomeBackground);
    const generalImage = getGeneralImage(member.guild, config);
    const embed = new EmbedBuilder()
      .setTitle(config.welcomeTitle || '🔥 مرحباً بك في المجتمع')
      .setDescription(config.welcomeMessage || `أهلاً ${member} في السيرفر!`)
      .setColor(0x2b2d31)
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
      title: '👤 عضو جديد',
      color: 0x2b2d31,
      description: `**${member.user.tag}** انضم إلى السيرفر.`,
      fields: [{ name: 'عدد الأعضاء', value: `${memberCount}`, inline: true }],
      thumbnail: member.user.displayAvatarURL(),
      footer: 'نظام الترحيب',
    });
  } catch (error) {
    console.error('❌ خطأ في الترحيب:', error);
  }
});

client.on('guildMemberRemove', async (member) => {
  try {
    await logToChannel(member.guild.id, {
      title: '🚫 عضو غادر',
      color: 0x2b2d31,
      description: `**${member.user.tag}** غادر السيرفر.`,
      thumbnail: member.user.displayAvatarURL(),
      footer: 'نظام الترحيب',
    });
  } catch (error) {
    console.error('❌ خطأ في مغادرة العضو:', error);
  }
});

client.on('messageDelete', async (message) => {
  if (!message.guild || message.author?.bot) return;
  try {
    await logToChannel(message.guild.id, {
      title: '🗑️ حذف رسالة',
      color: 0x2b2d31,
      description: `**المستخدم:** ${message.author?.tag || 'غير معروف'}\n**القناة:** ${message.channel.name}\n**المحتوى:** ${message.content || 'غير مرئي'}`,
      footer: 'سجلات الرسائل',
    });
  } catch (error) {
    console.error('❌ خطأ في حذف الرسالة:', error);
  }
});

client.on('messageUpdate', async (oldMessage, newMessage) => {
  if (!oldMessage.guild || oldMessage.author?.bot) return;
  if (oldMessage.content === newMessage.content) return;
  try {
    await logToChannel(oldMessage.guild.id, {
      title: '✏️ تعديل رسالة',
      color: 0x2b2d31,
      description: `**المستخدم:** ${oldMessage.author?.tag || 'غير معروف'}\n**القناة:** ${oldMessage.channel.name}`,
      fields: [
        { name: '📜 النص القديم', value: oldMessage.content || 'فارغ', inline: false },
        { name: '📝 النص الجديد', value: newMessage.content || 'فارغ', inline: false },
      ],
      footer: 'سجلات الرسائل',
    });
  } catch (error) {
    console.error('❌ خطأ في تعديل الرسالة:', error);
  }
});

// ============================================================
// ========== نظام المستويات والاقتصاد ==========
// ============================================================

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  if (message.content.startsWith('!')) return;

  const guildId = message.guild.id;
  const userId = message.author.id;
  const config = await getGuildConfig(guildId);

  // العملة (OG) في كل القنوات
  const eco = await getEconomy(guildId, userId);
  eco.messageCount += 1;
  if (eco.messageCount >= 30) {
    eco.messageCount = 0;
    eco.og += 15;
    await eco.save();
    try {
      const member = await message.guild.members.fetch(userId);
      const dmEmbed = new EmbedBuilder()
        .setTitle('💰 مكافأة OG')
        .setDescription(`حصلت على **15 OG** مقابل 30 رسالة في **${message.guild.name}**!\nرصيدك الحالي: **${eco.og} OG**`)
        .setColor(0x2b2d31);
      await member.send({ embeds: [dmEmbed] }).catch(() => {});
    } catch (e) {}
  } else {
    await eco.save();
  }

  // المستويات
  if (config.levelChannelId && message.channel.id !== config.levelChannelId) {
    // نخرج من المستويات
  } else {
    const userData = await getUserData(guildId, userId);
    userData.messages += 1;
    const gain = Math.floor(Math.random() * 15) + 5;
    userData.xp += gain;
    let currentLevel = userData.level;
    let requiredXP = (currentLevel + 1) * 100;

    if (userData.xp >= requiredXP) {
      userData.level += 1;
      userData.xp = 0;
      await userData.save();

      const levelChannelId = config.levelChannelId || message.channel.id;
      const levelChannel = message.guild.channels.cache.get(levelChannelId);
      if (levelChannel) {
        const embed = new EmbedBuilder()
          .setTitle('🎉 مستوى جديد!')
          .setDescription(`${message.author} وصل إلى المستوى **${userData.level}**!`)
          .setColor(0x2b2d31)
          .setTimestamp();
        const generalImage = getGeneralImage(message.guild, config);
        if (generalImage) embed.setThumbnail(generalImage);
        await levelChannel.send({ embeds: [embed] });
      }

      const levelRole = await LevelRole.findOne({ guildId, level: userData.level });
      if (levelRole) {
        const role = message.guild.roles.cache.get(levelRole.roleId);
        if (role) {
          const member = await message.guild.members.fetch(userId).catch(() => null);
          if (member) await member.roles.add(role).catch(() => {});
        }
      }
    } else {
      await userData.save();
    }
  }

  // الأوتو لاين
  const auto = await AutoLine.findOne({ guildId, channelId: message.channel.id });
  if (auto && auto.enabled && (auto.text || auto.image)) {
    const channel = client.channels.cache.get(message.channel.id);
    if (channel) {
      try {
        if (auto.text && auto.image) {
          const embed = new EmbedBuilder().setDescription(auto.text).setColor(0x2b2d31).setImage(auto.image).setTimestamp();
          await channel.send({ embeds: [embed] });
        } else if (auto.image) {
          const embed = new EmbedBuilder().setColor(0x2b2d31).setImage(auto.image).setTimestamp();
          await channel.send({ embeds: [embed] });
        } else if (auto.text) {
          await channel.send(auto.text);
        }
      } catch (e) {}
      return;
    }
  }

  // الردود التلقائية
  const autoReply = await findAutoReply(guildId, message.content);
  if (autoReply) {
    try {
      if (autoReply.image) {
        const embed = new EmbedBuilder().setDescription(autoReply.reply).setColor(0x2b2d31).setImage(autoReply.image).setTimestamp();
        await message.reply({ embeds: [embed] });
      } else {
        await message.reply(autoReply.reply);
      }
    } catch (e) {
      await message.channel.send(autoReply.reply).catch(() => {});
    }
  }
});

// ============================================================
// ========== نظام الفويس ==========
// ============================================================

const voiceTimeMap = new Map();

client.on('voiceStateUpdate', async (oldState, newState) => {
  const member = newState.member || oldState.member;
  if (!member || member.user.bot) return;
  const guildId = newState.guild.id;
  const userId = member.id;

  try {
    if (!oldState.channelId && newState.channelId) {
      voiceTimeMap.set(`${guildId}-${userId}`, Date.now());
    }

    if (oldState.channelId && !newState.channelId) {
      const key = `${guildId}-${userId}`;
      const joinTime = voiceTimeMap.get(key);
      if (joinTime) {
        const seconds = Math.floor((Date.now() - joinTime) / 1000);
        const minutes = Math.floor(seconds / 60);
        if (minutes >= 1) {
          const eco = await getEconomy(guildId, userId);
          const reward = Math.min(minutes, 30);
          eco.og += reward;
          await eco.save();
          try {
            const dmEmbed = new EmbedBuilder()
              .setTitle('💰 مكافأة OG للفويس')
              .setDescription(`حصلت على **${reward} OG** مقابل ${reward} دقيقة في الروم الصوتي في **${oldState.guild.name}**!\nرصيدك الحالي: **${eco.og} OG**`)
              .setColor(0x2b2d31);
            await member.send({ embeds: [dmEmbed] }).catch(() => {});
          } catch (e) {}
        }
        voiceTimeMap.delete(key);
      }
    }
  } catch (error) {
    console.error('❌ خطأ في voiceStateUpdate:', error);
  }
});

// ============================================================
// ========== الأوامر النصية ==========
// ============================================================

// ===== تحديد أوامر الإشراف فقط (تُحذف بعد 5 ثوانٍ) =====
function isAdminCommand(cmd) {
  const adminCmds = [
    'حظر', 'طرد', 'كتم', 'فك_كتم', 'تحذير', 'ابطال_تحذيرات',
    'مسح', 'قفل', 'فتح',
    'نقل_كل', 'طرد_صوتي', 'كتم_صوتي', 'فك_كتم_صوتي',
    'انشاء_قناة', 'حذف_قناة', 'تغيير_اسم_قناة',
    'تثبيت', 'الغاء_تثبيت', 'اعلان', 'ايمبد', 'قول',
    'اعطاء_رتبة', 'سحب_رتبة'
  ];
  return adminCmds.includes(cmd);
}

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  if (!message.content.startsWith('!')) return;
  const args = message.content.slice(1).trim().split(/ +/);
  const cmd = args.shift().toLowerCase();
  const guildId = message.guild.id;
  const config = await getGuildConfig(guildId);
  const generalImage = getGeneralImage(message.guild, config);

  // تحديد مدة الحذف: 5 ثوانٍ للأوامر الإشرافية فقط، 20 ثانية للباقي
  const deleteDelay = isAdminCommand(cmd) ? 5000 : 20000;
  let sentReply = null;

  const deleteAfter = async (replyMsg) => {
    setTimeout(async () => {
      try { await message.delete(); } catch (e) {}
      if (replyMsg) {
        try { await replyMsg.delete(); } catch (e) {}
      }
    }, deleteDelay);
  };

  try {

    // ============================================================
    // ===== أوامر العملة (لا تُحذف – تبقى دائمة) =====
    // ============================================================

    if (cmd === 'رصيدي') {
      const eco = await getEconomy(guildId, message.author.id);
      const embed = new EmbedBuilder()
        .setTitle(`💰 رصيد ${message.author.username}`)
        .setDescription(`**${eco.og} OG**`)
        .setColor(0x2b2d31);
      await message.channel.send({ embeds: [embed] });
      return;
    }

    if (cmd === 'توب') {
      const top = await Economy.find({ guildId }).sort({ og: -1 }).limit(10);
      if (!top.length) {
        await message.reply('📭 لا يوجد أي شخص لديه OG حتى الآن.');
        return;
      }
      let desc = '';
      let rank = 1;
      for (const entry of top) {
        const member = message.guild.members.cache.get(entry.userId);
        const name = member ? member.user.username : `مستخدم ${entry.userId}`;
        desc += `**#${rank}** ${name} - \`${entry.og} OG\`\n`;
        rank++;
      }
      const embed = new EmbedBuilder().setTitle('🏆 ترتيب أغنى 10 أشخاص').setDescription(desc).setColor(0x2b2d31).setTimestamp();
      await message.channel.send({ embeds: [embed] });
      return;
    }

    if (cmd === 'اعطاء_عملات' || cmd === 'اعطاء_عمله') {
      if (!(await hasPermission(message.member, guildId))) {
        await message.reply('❌ تحتاج صلاحية متحكم.');
        return;
      }
      const target = message.mentions.members.first();
      const amount = parseInt(args[0]);
      if (!target || !amount || amount <= 0) {
        await message.reply('⚠️ الاستخدام: `!اعطاء_عملات @شخص <المبلغ>`');
        return;
      }
      if (target.user.bot) {
        await message.reply('❌ لا يمكن إعطاء البوتات.');
        return;
      }
      const eco = await getEconomy(guildId, target.id);
      eco.og += amount;
      await eco.save();
      const embed = new EmbedBuilder()
        .setTitle('✅ تم إعطاء العملات')
        .setDescription(`تم إعطاء <@${target.id}> **${amount} OG** بنجاح.\nرصيده الآن: **${eco.og} OG**`)
        .setColor(0x2b2d31);
      await message.channel.send({ embeds: [embed] });
      try {
        const dmEmbed = new EmbedBuilder()
          .setTitle('💰 استلام OG')
          .setDescription(`تم إعطاؤك **${amount} OG** في **${message.guild.name}**!\nرصيدك الحالي: **${eco.og} OG**`)
          .setColor(0x2b2d31);
        await target.send({ embeds: [dmEmbed] }).catch(() => {});
      } catch (e) {}
      return;
    }

    if (cmd === 'سحب_عملات' || cmd === 'سحب_عمله') {
      if (!(await hasPermission(message.member, guildId))) {
        await message.reply('❌ تحتاج صلاحية متحكم.');
        return;
      }
      const target = message.mentions.members.first();
      const amount = parseInt(args[0]);
      if (!target || !amount || amount <= 0) {
        await message.reply('⚠️ الاستخدام: `!سحب_عملات @شخص <المبلغ>`');
        return;
      }
      if (target.user.bot) {
        await message.reply('❌ لا يمكن السحب من البوتات.');
        return;
      }
      const eco = await getEconomy(guildId, target.id);
      if (eco.og < amount) {
        await message.reply(`⚠️ رصيده غير كافٍ. لديه **${eco.og} OG** فقط.`);
        return;
      }
      eco.og -= amount;
      await eco.save();
      const embed = new EmbedBuilder()
        .setTitle('✅ تم سحب العملات')
        .setDescription(`تم سحب **${amount} OG** من <@${target.id}>.\nرصيده الآن: **${eco.og} OG**`)
        .setColor(0x2b2d31);
      await message.channel.send({ embeds: [embed] });
      return;
    }

    // ============================================================
    // ===== أوامر عامة (تُحذف بعد 20 ثانية) =====
    // ============================================================

    if (cmd === 'مساعدة') {
      const embed = new EmbedBuilder()
        .setTitle('📖 قائمة الأوامر')
        .setColor(0x2b2d31)
        .addFields(
          { name: '👑 نظام التحكم', value: '`متحكم @شخص` `الغاء_متحكم @شخص` `قائمة_المتحكمين`', inline: false },
          { name: '🛡️ الإدارة', value: '`حظر` `طرد` `كتم` `فك_كتم` `تحذير` `ابطال_تحذيرات` `مسح` `قفل` `فتح`', inline: false },
          { name: '🎭 إدارة الرتب', value: '`اعطاء_رتبة` `سحب_رتبة` `عرض_رتب`', inline: false },
          { name: '📁 إدارة القنوات', value: '`انشاء_قناة` `حذف_قناة` `تغيير_اسم_قناة`', inline: false },
          { name: '🔊 إدارة الصوت', value: '`نقل_كل` `طرد_صوتي` `كتم_صوتي` `فك_كتم_صوتي`', inline: false },
          { name: '📌 إدارة الرسائل', value: '`تثبيت` `الغاء_تثبيت`', inline: false },
          { name: '📊 المستويات', value: '`مستوى` `ترتيب` `تعيين روم_ليفل #قناة`', inline: false },
          { name: '👋 الترحيب', value: '`تعيين ترحيب #قناة` `تعيين رسالة_ترحيب نص` `تعيين صورة_ترحيب رابط` `تعيين عنوان_ترحيب نص` `تعيين خلفية_ترحيب [لون/رابط]`', inline: false },
          { name: '📋 اللوق', value: '`تعيين سجلات #قناة` `اختبار_لوق`', inline: false },
          { name: '🤖 الأوتو لاين (متعدد الرومات)', value: '`تعيين اوتر_لاين #روم [نص]` `تعيين صورة_اوترلاين #روم رابط` `تفعيل_اوترلاين #روم` `تعطيل_اوترلاين #روم` `حذف_اوترلاين #روم`', inline: false },
          { name: '💬 الردود التلقائية', value: '`رد_تلقائي كلمة رد` `رد_تلقائي_صورة كلمة رد رابط` `حذف_رد_تلقائي كلمة` `عرض_الردود`', inline: false },
          { name: '💡 الاقتراحات', value: '`بانل_اقتراح` (للمتحكمين) – ينشئ لوحة اقتراحات', inline: false },
          { name: '🎫 التذاكر', value: '`بانل` `عرض_تذكرة` `تعيين تذكرة` (للمتحكمين)', inline: false },
          { name: '🔔 رتب الإشعارات', value: '`رتب` (للمتحكمين)', inline: false },
          { name: '✏️ تغيير الاسم', value: '`تغيير_اسم`', inline: false },
          { name: 'ℹ️ معلومات', value: '`معلومات` `سيرفر` `بينق`', inline: false },
          { name: '⚙️ إعدادات', value: '`تعيين` (للمتحكمين)', inline: false },
          { name: '📸 إنستغرام', value: '`ig رابط_الريلز` – تحميل فيديو من إنستغرام', inline: false },
          { name: '💰 الاقتصاد', value: '`رصيدي` `توب` `اعطاء_عملات @شخص مبلغ` `سحب_عملات @شخص مبلغ` (العملة: OG)', inline: false }
        )
        .setFooter({ text: `🔥 البادئة: !` });
      if (generalImage) embed.setImage(generalImage);
      sentReply = await message.channel.send({ embeds: [embed] });
      deleteAfter(sentReply);
      return;
    }

    if (cmd === 'ig') {
      const url = args[0];
      if (!url) {
        sentReply = await message.reply('⚠️ أدخل رابط الرقصة (ريلز) من إنستغرام.');
        deleteAfter(sentReply);
        return;
      }
      const loadingMsg = await message.reply('⏳ جاري تحميل الفيديو...');
      try {
        const instagramGetUrl = require('instagram-url-direct');
        const result = await instagramGetUrl(url);
        const videoUrl = Array.isArray(result) ? result[0]?.url : result.url;
        if (!videoUrl) throw new Error('تعذر استخراج رابط الفيديو.');
        const response = await fetch(videoUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const buffer = Buffer.from(await response.arrayBuffer());
        sentReply = await message.reply({ files: [{ attachment: buffer, name: 'reel.mp4' }] });
        await loadingMsg.delete().catch(() => {});
        deleteAfter(sentReply);
      } catch (error) {
        await loadingMsg.edit({ content: `❌ فشل التحميل: ${error.message}` }).catch(() => {});
        deleteAfter(loadingMsg);
      }
      return;
    }

    if (cmd === 'متحكم') {
      if (!OWNER_ID || message.author.id !== OWNER_ID) {
        sentReply = await message.reply('❌ هذا الأمر للمالك فقط.');
        deleteAfter(sentReply);
        return;
      }
      const member = message.mentions.members.first();
      if (!member) {
        sentReply = await message.reply('⚠️ منشن العضو.');
        deleteAfter(sentReply);
        return;
      }
      if (member.id === client.user.id) {
        sentReply = await message.reply('❌ لا يمكنني جعل نفسي متحكماً.');
        deleteAfter(sentReply);
        return;
      }
      if (member.id === OWNER_ID) {
        sentReply = await message.reply('❌ هذا هو مالك البوت، يملك صلاحية مطلقة مسبقاً.');
        deleteAfter(sentReply);
        return;
      }
      if (await isController(member.id, guildId)) {
        sentReply = await message.reply(`⚠️ ${member} متحكم بالفعل.`);
        deleteAfter(sentReply);
        return;
      }
      await addController(guildId, member.id);
      await logToChannel(guildId, { title: '🛡️ تعيين متحكم', color: 0x2b2d31, description: `**${message.author}** جعل ${member} متحكماً.` });
      sentReply = await message.reply(`✅ تم جعل ${member} متحكماً على البوت في هذا السيرفر.`);
      deleteAfter(sentReply);
      return;
    }

    if (cmd === 'الغاء_متحكم') {
      if (!OWNER_ID || message.author.id !== OWNER_ID) {
        sentReply = await message.reply('❌ هذا الأمر للمالك فقط.');
        deleteAfter(sentReply);
        return;
      }
      const member = message.mentions.members.first();
      if (!member) {
        sentReply = await message.reply('⚠️ منشن العضو.');
        deleteAfter(sentReply);
        return;
      }
      if (member.id === OWNER_ID) {
        sentReply = await message.reply('❌ لا يمكن إزالة صلاحية مالك البوت.');
        deleteAfter(sentReply);
        return;
      }
      if (!(await isController(member.id, guildId))) {
        sentReply = await message.reply(`⚠️ ${member} ليس متحكماً.`);
        deleteAfter(sentReply);
        return;
      }
      await removeController(guildId, member.id);
      await logToChannel(guildId, { title: '🛡️ إلغاء متحكم', color: 0x2b2d31, description: `**${message.author}** ألغى صلاحية ${member}.` });
      sentReply = await message.reply(`✅ تم إلغاء صلاحية التحكم عن ${member}.`);
      deleteAfter(sentReply);
      return;
    }

    if (cmd === 'قائمة_المتحكمين') {
      const controllers = await getControllers(guildId);
      if (!controllers.length) {
        sentReply = await message.reply('📋 لا يوجد متحكمون في هذا السيرفر.');
        deleteAfter(sentReply);
        return;
      }
      const list = controllers.map(id => `<@${id}>`).join('\n');
      const embed = new EmbedBuilder().setTitle('🛡️ قائمة المتحكمين').setColor(0x2b2d31).setDescription(list).setTimestamp();
      if (generalImage) embed.setImage(generalImage);
      sentReply = await message.channel.send({ embeds: [embed] });
      deleteAfter(sentReply);
      return;
    }

    // ===== أمر تعيين =====
    if (cmd === 'تعيين') {
      if (!(await hasPermission(message.member, guildId))) {
        sentReply = await message.reply('❌ تحتاج صلاحية متحكم.');
        deleteAfter(sentReply);
        return;
      }

      const sub = args[0]?.toLowerCase();
      const value = args.slice(1).join(' ');

      if (!sub) {
        const embed = new EmbedBuilder()
          .setTitle('⚙️ أوامر الإعدادات')
          .setColor(0x2b2d31)
          .addFields(
            { name: '👋 الترحيب', value: '`ترحيب #قناة`، `رسالة_ترحيب نص`، `صورة_ترحيب رابط`، `عنوان_ترحيب نص`، `خلفية_ترحيب [لون/رابط]`', inline: false },
            { name: '📋 اللوق', value: '`سجلات #قناة`' },
            { name: '📊 المستويات', value: '`روم_ليفل #قناة`' },
            { name: '🤖 الأوتو لاين (متعدد الرومات)', value: '`اوتر_لاين #روم [نص]`، `صورة_اوترلاين #روم رابط`، `تفعيل_اوترلاين #روم`، `تعطيل_اوترلاين #روم`، `حذف_اوترلاين #روم`' },
            { name: '🎫 التذاكر', value: '`تذكرة` (لإدارة الأقسام)' },
            { name: '🔔 رتب الإشعارات', value: '`صورة_رتب رابط`' },
            { name: '🖼️ عام', value: '`صورة_بنر رابط`، `صورة_عامة رابط`' },
            { name: '🚪 دور الدخول', value: '`دور_دخول @دور`' },
            { name: '💡 الاقتراحات', value: '`قناة_اقتراح #قناة`، `عنوان_اقتراح نص`، `وصف_اقتراح نص`، `لون_اقتراح #هيكس`، `صورة_اقتراح رابط`' }
          )
          .setFooter({ text: 'الصيغة: !تعيين [الخيار] [القيمة]' });
        if (generalImage) embed.setImage(generalImage);
        sentReply = await message.channel.send({ embeds: [embed] });
        deleteAfter(sentReply);
        return;
      }

      // الترحيب
      if (sub === 'ترحيب') {
        const channel = message.mentions.channels.first();
        if (!channel) {
          await updateGuildConfig(guildId, { welcomeChannel: null });
          await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0x2b2d31, description: `**${message.author}** ألغى قناة الترحيب.` });
          sentReply = await message.reply('✅ تم إلغاء تحديد قناة الترحيب.');
          deleteAfter(sentReply);
          return;
        }
        await updateGuildConfig(guildId, { welcomeChannel: channel.id });
        await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0x2b2d31, description: `**${message.author}** عيّن قناة الترحيب إلى ${channel}.` });
        sentReply = await message.reply(`✅ تم تعيين قناة الترحيب إلى ${channel}`);
        deleteAfter(sentReply);
        return;
      }

      if (sub === 'رسالة_ترحيب') {
        if (!value) {
          sentReply = await message.reply('⚠️ أدخل نص الترحيب الجديد.');
          deleteAfter(sentReply);
          return;
        }
        await updateGuildConfig(guildId, { welcomeMessage: value });
        await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0x2b2d31, description: `**${message.author}** غيّر نص الترحيب إلى:\n${value}` });
        sentReply = await message.reply(`✅ تم تعيين نص الترحيب:\n${value}`);
        deleteAfter(sentReply);
        return;
      }

      if (sub === 'صورة_ترحيب') {
        if (!value) {
          await updateGuildConfig(guildId, { welcomeImage: null });
          await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0x2b2d31, description: `**${message.author}** ألغى صورة الترحيب.` });
          sentReply = await message.reply('✅ تم إلغاء صورة الترحيب.');
          deleteAfter(sentReply);
          return;
        }
        await updateGuildConfig(guildId, { welcomeImage: value });
        await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0x2b2d31, description: `**${message.author}** عيّن صورة الترحيب: ${value}` });
        sentReply = await message.reply(`✅ تم تعيين صورة الترحيب: ${value}`);
        deleteAfter(sentReply);
        return;
      }

      if (sub === 'عنوان_ترحيب') {
        if (!value) {
          sentReply = await message.reply('⚠️ أدخل العنوان الجديد.');
          deleteAfter(sentReply);
          return;
        }
        await updateGuildConfig(guildId, { welcomeTitle: value });
        await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0x2b2d31, description: `**${message.author}** غيّر عنوان الترحيب إلى: "${value}"` });
        sentReply = await message.reply(`✅ تم تعيين عنوان الترحيب: "${value}"`);
        deleteAfter(sentReply);
        return;
      }

      // خلفية الترحيب
      if (sub === 'خلفية_ترحيب') {
        if (!value) {
          await updateGuildConfig(guildId, { welcomeBackground: null });
          await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0x2b2d31, description: `**${message.author}** ألغى خلفية الترحيب.` });
          sentReply = await message.reply('✅ تم إلغاء خلفية الترحيب (ستستخدم الخلفية الافتراضية).');
          deleteAfter(sentReply);
          return;
        }
        const isHex = /^#[0-9a-fA-F]{6}$/.test(value);
        const isUrl = /^https?:\/\/.+\.(png|jpg|jpeg|gif|webp)/i.test(value);
        if (!isHex && !isUrl) {
          sentReply = await message.reply('⚠️ أدخل لوناً صحيحاً بصيغة Hex مثل `#2b2d31` أو رابط صورة صالح.');
          deleteAfter(sentReply);
          return;
        }
        await updateGuildConfig(guildId, { welcomeBackground: value });
        await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0x2b2d31, description: `**${message.author}** عيّن خلفية الترحيب إلى: ${value}` });
        sentReply = await message.reply(`✅ تم تعيين خلفية الترحيب: ${value}`);
        deleteAfter(sentReply);
        return;
      }

      // اللوق
      if (sub === 'سجلات') {
        const channel = message.mentions.channels.first();
        if (!channel) {
          await updateGuildConfig(guildId, { logChannel: null });
          sentReply = await message.reply('✅ تم إلغاء تعيين قناة اللوق.');
          deleteAfter(sentReply);
          return;
        }
        await updateGuildConfig(guildId, { logChannel: channel.id });
        await logToChannel(guildId, { title: '📋 تم تعيين قناة اللوق', color: 0x2b2d31, description: `**${message.author}** عيّن قناة اللوق إلى ${channel}` });
        sentReply = await message.reply(`✅ تم تعيين قناة اللوق إلى ${channel}`);
        deleteAfter(sentReply);
        return;
      }

      // روم الليفل
      if (sub === 'روم_ليفل') {
        const channel = message.mentions.channels.first();
        if (!channel) {
          await updateGuildConfig(guildId, { levelChannelId: null });
          await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0x2b2d31, description: `**${message.author}** ألغى قناة الليفل.` });
          sentReply = await message.reply('✅ تم إلغاء تحديد قناة الليفل.');
          deleteAfter(sentReply);
          return;
        }
        await updateGuildConfig(guildId, { levelChannelId: channel.id });
        await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0x2b2d31, description: `**${message.author}** عيّن قناة الليفل إلى ${channel}.` });
        sentReply = await message.reply(`✅ تم تعيين قناة الليفل إلى ${channel}`);
        deleteAfter(sentReply);
        return;
      }

      // الأوتو لاين
      if (sub === 'اوتر_لاين') {
        const channel = message.mentions.channels.first();
        if (!channel) {
          sentReply = await message.reply('⚠️ منشن الروم.');
          deleteAfter(sentReply);
          return;
        }
        const text = args.slice(2).join(' ');
        await setAutoLine(guildId, channel.id, { text: text || null, enabled: true });
        await logToChannel(guildId, { title: '🤖 تعيين أوتو لاين', color: 0x2b2d31, description: `**${message.author}** عيّن الأوتو لاين في ${channel}${text ? `:\n${text}` : ''}` });
        const embed = new EmbedBuilder()
          .setTitle('✅ تم تعيين الأوتو لاين')
          .setColor(0x2b2d31)
          .setDescription(`**الروم:** ${channel}${text ? `\n**النص:** ${text}` : ''}`)
          .setFooter({ text: 'تم التفعيل تلقائياً لهذا الروم.' });
        if (generalImage) embed.setImage(generalImage);
        sentReply = await message.channel.send({ embeds: [embed] });
        deleteAfter(sentReply);
        return;
      }

      if (sub === 'صورة_اوترلاين') {
        const channel = message.mentions.channels.first();
        if (!channel) {
          sentReply = await message.reply('⚠️ منشن الروم.');
          deleteAfter(sentReply);
          return;
        }
        const imageUrl = args.slice(2).join(' ');
        if (!imageUrl) {
          await setAutoLine(guildId, channel.id, { image: null });
          await logToChannel(guildId, { title: '🖼️ إزالة صورة أوتو لاين', color: 0x2b2d31, description: `**${message.author}** أزال صورة الأوتو لاين في ${channel}` });
          sentReply = await message.reply(`✅ تم إزالة صورة الأوتو لاين من ${channel}`);
          deleteAfter(sentReply);
          return;
        }
        await setAutoLine(guildId, channel.id, { image: imageUrl });
        await logToChannel(guildId, { title: '🖼️ تعيين صورة أوتو لاين', color: 0x2b2d31, description: `**${message.author}** عيّن صورة الأوتو لاين في ${channel}: ${imageUrl}` });
        const embed = new EmbedBuilder()
          .setTitle('✅ تم تعيين صورة الأوتو لاين')
          .setColor(0x2b2d31)
          .setDescription(`**الروم:** ${channel}\n[رابط الصورة](${imageUrl})`)
          .setImage(imageUrl);
        if (generalImage) embed.setThumbnail(generalImage);
        sentReply = await message.channel.send({ embeds: [embed] });
        deleteAfter(sentReply);
        return;
      }

      if (sub === 'تفعيل_اوترلاين') {
        const channel = message.mentions.channels.first();
        if (!channel) {
          sentReply = await message.reply('⚠️ منشن الروم.');
          deleteAfter(sentReply);
          return;
        }
        const auto = await AutoLine.findOne({ guildId, channelId: channel.id });
        if (!auto || (!auto.text && !auto.image)) {
          sentReply = await message.reply(`⚠️ لم يتم تعيين نص أو صورة لهذا الروم. استخدم \`!تعيين اوتر_لاين ${channel} [نص]\` أولاً.`);
          deleteAfter(sentReply);
          return;
        }
        await setAutoLine(guildId, channel.id, { enabled: true });
        await logToChannel(guildId, { title: '✅ تفعيل أوتو لاين', color: 0x2b2d31, description: `**${message.author}** فعّل الأوتو لاين في ${channel}.` });
        const embed = new EmbedBuilder()
          .setTitle('✅ تم تفعيل الأوتو لاين')
          .setColor(0x2b2d31)
          .setDescription(`تم تشغيل النظام في ${channel}. سيرد البوت تلقائياً بعد كل رسالة.`);
        if (generalImage) embed.setImage(generalImage);
        sentReply = await message.channel.send({ embeds: [embed] });
        deleteAfter(sentReply);
        return;
      }

      if (sub === 'تعطيل_اوترلاين') {
        const channel = message.mentions.channels.first();
        if (!channel) {
          sentReply = await message.reply('⚠️ منشن الروم.');
          deleteAfter(sentReply);
          return;
        }
        await setAutoLine(guildId, channel.id, { enabled: false });
        await logToChannel(guildId, { title: '⏹️ تعطيل أوتو لاين', color: 0x2b2d31, description: `**${message.author}** عطّل الأوتو لاين في ${channel}.` });
        const embed = new EmbedBuilder()
          .setTitle('⏹️ تم تعطيل الأوتو لاين')
          .setColor(0x2b2d31)
          .setDescription(`تم إيقاف النظام في ${channel}. لن يرد البوت تلقائياً حتى يتم تفعيله مرة أخرى.`);
        if (generalImage) embed.setImage(generalImage);
        sentReply = await message.channel.send({ embeds: [embed] });
        deleteAfter(sentReply);
        return;
      }

      if (sub === 'حذف_اوترلاين' || sub === 'حذف_اوتر_لاين') {
        const channel = message.mentions.channels.first();
        if (!channel) {
          sentReply = await message.reply('⚠️ منشن الروم.');
          deleteAfter(sentReply);
          return;
        }
        await deleteAutoLine(guildId, channel.id);
        await logToChannel(guildId, { title: '🗑️ حذف أوتو لاين', color: 0x2b2d31, description: `**${message.author}** حذف إعدادات الأوتو لاين في ${channel}.` });
        const embed = new EmbedBuilder()
          .setTitle('🗑️ تم حذف الأوتو لاين')
          .setColor(0x2b2d31)
          .setDescription(`تم حذف جميع إعدادات الأوتو لاين من ${channel}.`);
        if (generalImage) embed.setImage(generalImage);
        sentReply = await message.channel.send({ embeds: [embed] });
        deleteAfter(sentReply);
        return;
      }

      // دور دخول
      if (sub === 'دور_دخول') {
        const role = message.mentions.roles.first();
        if (!role) {
          sentReply = await message.reply('⚠️ منشن الدور.');
          deleteAfter(sentReply);
          return;
        }
        await updateGuildConfig(guildId, { joinRole: role.id });
        await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0x2b2d31, description: `**${message.author}** عيّن دور الدخول إلى ${role.name}.` });
        sentReply = await message.reply(`✅ تم تعيين دور الدخول إلى ${role}`);
        deleteAfter(sentReply);
        return;
      }

      if (sub === 'صورة_بانل') {
        if (!value) {
          sentReply = await message.reply('⚠️ أدخل رابط الصورة.');
          deleteAfter(sentReply);
          return;
        }
        await updateGuildConfig(guildId, { ticketPanelImage: value });
        await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0x2b2d31, description: `**${message.author}** عيّن صورة البانل: ${value}` });
        sentReply = await message.reply(`✅ تم تعيين صورة البانل: ${value}`);
        deleteAfter(sentReply);
        return;
      }

      if (sub === 'صورة_رتب') {
        if (!value) {
          sentReply = await message.reply('⚠️ أدخل رابط الصورة.');
          deleteAfter(sentReply);
          return;
        }
        await updateGuildConfig(guildId, { rolesImage: value });
        await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0x2b2d31, description: `**${message.author}** عيّن صورة رتب الإشعارات: ${value}` });
        sentReply = await message.reply(`✅ تم تعيين صورة رتب الإشعارات: ${value}`);
        deleteAfter(sentReply);
        return;
      }

      if (sub === 'صورة_بنر') {
        if (!value) {
          sentReply = await message.reply('⚠️ أدخل رابط الصورة.');
          deleteAfter(sentReply);
          return;
        }
        await updateGuildConfig(guildId, { bannerImage: value });
        await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0x2b2d31, description: `**${message.author}** عيّن صورة البنر: ${value}` });
        sentReply = await message.reply(`✅ تم تعيين صورة البنر: ${value}`);
        deleteAfter(sentReply);
        return;
      }

      if (sub === 'صورة_عامة') {
        if (!value) {
          sentReply = await message.reply('⚠️ أدخل رابط الصورة.');
          deleteAfter(sentReply);
          return;
        }
        await updateGuildConfig(guildId, { generalImage: value });
        await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0x2b2d31, description: `**${message.author}** عيّن الصورة العامة: ${value}` });
        sentReply = await message.reply(`✅ تم تعيين الصورة العامة: ${value}`);
        deleteAfter(sentReply);
        return;
      }

      // الاقتراحات
      if (sub === 'قناة_اقتراح') {
        const channel = message.mentions.channels.first();
        if (!channel) {
          sentReply = await message.reply('⚠️ منشن القناة.');
          deleteAfter(sentReply);
          return;
        }
        await updateGuildConfig(guildId, { suggestionsChannel: channel.id });
        await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0x2b2d31, description: `**${message.author}** عيّن قناة الاقتراحات إلى ${channel}` });
        sentReply = await message.reply(`✅ تم تعيين قناة الاقتراحات إلى ${channel}`);
        deleteAfter(sentReply);
        return;
      }

      if (sub === 'عنوان_اقتراح') {
        if (!value) {
          sentReply = await message.reply('⚠️ أدخل العنوان.');
          deleteAfter(sentReply);
          return;
        }
        await updateGuildConfig(guildId, { suggestionsTitle: value });
        await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0x2b2d31, description: `**${message.author}** غيّر عنوان الاقتراحات إلى: "${value}"` });
        sentReply = await message.reply(`✅ تم تعيين عنوان الاقتراحات: "${value}"`);
        deleteAfter(sentReply);
        return;
      }

      if (sub === 'وصف_اقتراح') {
        if (!value) {
          sentReply = await message.reply('⚠️ أدخل الوصف.');
          deleteAfter(sentReply);
          return;
        }
        await updateGuildConfig(guildId, { suggestionsDescription: value });
        await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0x2b2d31, description: `**${message.author}** غيّر وصف الاقتراحات إلى:\n${value}` });
        sentReply = await message.reply(`✅ تم تعيين وصف الاقتراحات:\n${value}`);
        deleteAfter(sentReply);
        return;
      }

      if (sub === 'لون_اقتراح') {
        if (!value || !value.match(/^#[0-9a-fA-F]{6}$/)) {
          sentReply = await message.reply('⚠️ أدخل لوناً صحيحاً بصيغة Hex مثل `#2b2d31`.');
          deleteAfter(sentReply);
          return;
        }
        await updateGuildConfig(guildId, { suggestionsColor: value });
        await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0x2b2d31, description: `**${message.author}** عيّن لون الاقتراحات إلى ${value}` });
        sentReply = await message.reply(`✅ تم تعيين لون الاقتراحات: ${value}`);
        deleteAfter(sentReply);
        return;
      }

      if (sub === 'صورة_اقتراح') {
        if (!value) {
          sentReply = await message.reply('⚠️ أدخل رابط الصورة.');
          deleteAfter(sentReply);
          return;
        }
        await updateGuildConfig(guildId, { suggestionsImage: value });
        await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0x2b2d31, description: `**${message.author}** عيّن صورة الاقتراحات: ${value}` });
        sentReply = await message.reply(`✅ تم تعيين صورة الاقتراحات: ${value}`);
        deleteAfter(sentReply);
        return;
      }

      // التذاكر
      if (sub === 'تذكرة') {
        const settings = await getTicketSettings(guildId);
        const action = args[1]?.toLowerCase();
        const actionValue = args.slice(2).join(' ');

        if (!action) {
          const embed = new EmbedBuilder()
            .setTitle('⚙️ إدارة التذاكر')
            .setColor(0x2b2d31)
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
          sentReply = await message.channel.send({ embeds: [embed] });
          deleteAfter(sentReply);
          return;
        }

        if (action === 'إضافة') {
          const parts = actionValue.match(/^(.+?)\s+<@&(\d+)>\s*(\S+)?$/);
          if (!parts) {
            sentReply = await message.reply('⚠️ الصيغة: `!تعيين تذكرة إضافة [الاسم] @دور :ايموجي:`\nمثال: `!تعيين تذكرة إضافة دعم فني @Support 🛠️`');
            deleteAfter(sentReply);
            return;
          }
          const sectionName = parts[1].trim();
          const roleId = parts[2];
          const emoji = parts[3] || '📌';

          if (settings.sections.find(s => s.name === sectionName)) {
            sentReply = await message.reply(`⚠️ قسم "${sectionName}" موجود بالفعل.`);
            deleteAfter(sentReply);
            return;
          }

          settings.sections.push({ name: sectionName, roleId, emoji });
          await saveTicketSettings(guildId, settings);
          await logToChannel(guildId, { title: '🎫 إضافة قسم تذكرة', color: 0x2b2d31, description: `**${message.author}** أضاف قسم **${sectionName}** مع دور <@&${roleId}> وإيموجي ${emoji}` });
          sentReply = await message.reply(`✅ تم إضافة قسم **${sectionName}** مع دور <@&${roleId}> وإيموجي ${emoji}.`);
          deleteAfter(sentReply);
          return;
        }

        if (action === 'تعيين_ايموجي') {
          const parts = actionValue.match(/^(.+?)\s+(\S+)$/);
          if (!parts) {
            sentReply = await message.reply('⚠️ الصيغة: `!تعيين تذكرة تعيين_ايموجي [الاسم] :ايموجي:`');
            deleteAfter(sentReply);
            return;
          }
          const sectionName = parts[1].trim();
          const emoji = parts[2];

          const section = settings.sections.find(s => s.name === sectionName);
          if (!section) {
            sentReply = await message.reply(`⚠️ قسم "${sectionName}" غير موجود.`);
            deleteAfter(sentReply);
            return;
          }

          section.emoji = emoji;
          await saveTicketSettings(guildId, settings);
          await logToChannel(guildId, { title: '🎨 تعيين إيموجي قسم', color: 0x2b2d31, description: `**${message.author}** عيّن الإيموجي ${emoji} لقسم **${sectionName}**` });
          sentReply = await message.reply(`✅ تم تعيين الإيموجي ${emoji} لقسم **${sectionName}**.`);
          deleteAfter(sentReply);
          return;
        }

        if (action === 'حذف') {
          const sectionName = actionValue.trim();
          const index = settings.sections.findIndex(s => s.name === sectionName);
          if (index === -1) {
            sentReply = await message.reply(`⚠️ قسم "${sectionName}" غير موجود.`);
            deleteAfter(sentReply);
            return;
          }
          settings.sections.splice(index, 1);
          await saveTicketSettings(guildId, settings);
          await logToChannel(guildId, { title: '🗑️ حذف قسم تذكرة', color: 0x2b2d31, description: `**${message.author}** حذف قسم **${sectionName}**` });
          sentReply = await message.reply(`✅ تم حذف قسم **${sectionName}**.`);
          deleteAfter(sentReply);
          return;
        }

        if (action === 'نص') {
          if (!actionValue) {
            sentReply = await message.reply('⚠️ أدخل النص الجديد.');
            deleteAfter(sentReply);
            return;
          }
          settings.text = actionValue;
          await saveTicketSettings(guildId, settings);
          await logToChannel(guildId, { title: '📝 تغيير نص التذاكر', color: 0x2b2d31, description: `**${message.author}** غيّر نص التذاكر.` });
          sentReply = await message.reply(`✅ تم تغيير نص التذاكر:\n${actionValue}`);
          deleteAfter(sentReply);
          return;
        }

        if (action === 'صورة') {
          if (!actionValue) {
            sentReply = await message.reply('⚠️ أدخل رابط الصورة.');
            deleteAfter(sentReply);
            return;
          }
          settings.image = actionValue;
          await saveTicketSettings(guildId, settings);
          await logToChannel(guildId, { title: '🖼️ تغيير صورة التذاكر', color: 0x2b2d31, description: `**${message.author}** غيّر صورة التذاكر.` });
          sentReply = await message.reply(`✅ تم تغيير صورة التذاكر: ${actionValue}`);
          deleteAfter(sentReply);
          return;
        }

        sentReply = await message.reply('⚠️ أمر غير معروف. استخدم `!تعيين تذكرة` لعرض التعليمات.');
        deleteAfter(sentReply);
        return;
      }

      sentReply = await message.reply('⚠️ خيار غير معروف. استخدم `!تعيين` لعرض القائمة.');
      deleteAfter(sentReply);
      return;
    }

    // ============================================================
    // ===== لوحات تبقى دائمة (لا تُحذف) =====
    // ============================================================

    // ===== بانل_اقتراح – تبقى دائمة =====
    if (cmd === 'بانل_اقتراح') {
      if (!(await hasPermission(message.member, guildId))) {
        await message.reply('❌ تحتاج صلاحية متحكم.');
        return;
      }
      const color = parseInt(config.suggestionsColor?.replace('#', '') || '2b2d31', 16);
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
      await logToChannel(guildId, { title: '💡 إنشاء لوحة اقتراحات', color: 0x2b2d31, description: `**${message.author}** أنشأ لوحة الاقتراحات.`, footer: 'الاقتراحات' });
      await message.reply('✅ تم إنشاء لوحة الاقتراحات.');
      return;
    }

    // ===== بانل (لوحة التذاكر) – تبقى دائمة =====
    if (cmd === 'بانل') {
      if (!(await hasPermission(message.member, guildId))) {
        await message.reply('❌ تحتاج صلاحية متحكم.');
        return;
      }
      const settings = await getTicketSettings(guildId);
      const imageUrl = settings.image || 'https://i.imgur.com/GkKqN3G.png';
      const embed = new EmbedBuilder().setTitle('🎫 تذاكر دعم فني').setDescription(settings.text).setColor(0x2b2d31).setImage(imageUrl).setFooter({ text: 'سيتم إنشاء قناة خاصة بك وسيرد عليك الفريق.' });
      if (generalImage) embed.setThumbnail(generalImage);
      const options = settings.sections.map(s => ({
        label: s.name,
        value: s.name,
        emoji: s.emoji || '📌',
      }));
      if (!options.length) {
        await message.reply('⚠️ لا توجد أقسام مضافة. استخدم `!تعيين تذكرة إضافة` لإضافة قسم.');
        return;
      }
      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('ticket_menu')
          .setPlaceholder('📌 اختر القسم...')
          .addOptions(options)
      );
      await message.channel.send({ embeds: [embed], components: [row] });
      await logToChannel(guildId, { title: '🎫 إنشاء لوحة تذاكر', color: 0x2b2d31, description: `**${message.author}** أنشأ لوحة تذاكر.` });
      await message.reply('✅ تم إنشاء لوحة التذاكر.');
      return;
    }

    // ===== رتب (لوحة الإشعارات) – تبقى دائمة =====
    if (cmd === 'رتب') {
      if (!(await hasPermission(message.member, guildId))) {
        await message.reply('❌ تحتاج صلاحية متحكم.');
        return;
      }
      const defaultImage = 'https://i.imgur.com/7dXe7tM.png';
      const imageUrl = config.rolesImage || defaultImage;
      const embed = new EmbedBuilder().setTitle('🔔 رتب الإشعارات').setDescription('اختر الرتب التي تريد استلام إشعارات عنها من خلال الأزرار أدناه.').setColor(0x2b2d31).setImage(imageUrl).setFooter({ text: 'اضغط مرة للحصول على الرتبة، ومرة أخرى لإزالتها.' });
      if (generalImage) embed.setThumbnail(generalImage);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('role_game').setLabel('🎮 Game Notice').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('role_event').setLabel('📅 Event Notice').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('role_ajr').setLabel('🔊 Ajr Notice').setStyle(ButtonStyle.Secondary)
      );
      await message.channel.send({ embeds: [embed], components: [row] });
      await logToChannel(guildId, { title: '🔔 إنشاء لوحة رتب الإشعارات', color: 0x2b2d31, description: `**${message.author}** أنشأ لوحة رتب الإشعارات.` });
      await message.reply('✅ تم إنشاء لوحة الرتب.');
      return;
    }

    // ============================================================
    // ===== أوامر الإشراف (تُحذف بعد 5 ثوانٍ) =====
    // ============================================================

    // جميع الأوامر المذكورة في isAdminCommand سيتم تطبيق deleteAfter عليها تلقائياً
    // لأن deleteDelay = 5000 لها، والـ deleteAfter يُطبق على كل الأوامر التي ترسل رداً

    // ===== باقي الأوامر =====

    // عرض_تذكرة (يُحذف)
    if (cmd === 'عرض_تذكرة') {
      const settings = await getTicketSettings(guildId);
      const embed = new EmbedBuilder().setTitle('📋 إعدادات التذاكر').setColor(0x2b2d31)
        .setDescription(`**النص:** ${settings.text}`)
        .addFields(
          { name: '📌 الأقسام', value: settings.sections.map((s, i) => `${i+1}. ${s.emoji || '📌'} **${s.name}** ${s.roleId ? `<@&${s.roleId}>` : '(بدون دور)'}`).join('\n') || 'لا يوجد أقسام', inline: false },
          { name: '🖼️ الصورة', value: settings.image ? `[رابط](${settings.image})` : 'لا توجد صورة', inline: true }
        )
        .setFooter({ text: 'استخدم !تعيين تذكرة لإدارة الأقسام' });
      if (generalImage) embed.setImage(generalImage);
      sentReply = await message.channel.send({ embeds: [embed] });
      deleteAfter(sentReply);
      return;
    }

    // اختبار_لوق (يُحذف)
    if (cmd === 'اختبار_لوق') {
      if (!(await hasPermission(message.member, guildId))) {
        sentReply = await message.reply('❌ تحتاج صلاحية متحكم.');
        deleteAfter(sentReply);
        return;
      }
      if (!config.logChannel) {
        sentReply = await message.reply('⚠️ لم يتم تعيين قناة اللوق.');
        deleteAfter(sentReply);
        return;
      }
      const channel = message.guild.channels.cache.get(config.logChannel);
      if (!channel) {
        sentReply = await message.reply('❌ قناة اللوق غير موجودة.');
        deleteAfter(sentReply);
        return;
      }
      await logToChannel(guildId, {
        title: '🧪 اختبار اللوق',
        color: 0x2b2d31,
        description: `✅ اللوق يعمل بنجاح!\n**المنفذ:** ${message.author}`,
        footer: 'رسالة اختبار',
      });
      sentReply = await message.reply('✅ تم إرسال رسالة اختبار إلى قناة اللوق.');
      deleteAfter(sentReply);
      return;
    }

    // مستوى (يُحذف)
    if (cmd === 'مستوى') {
      const member = message.mentions.members.first() || message.member;
      const userData = await getUserData(guildId, member.id);
      const embed = new EmbedBuilder()
        .setTitle(`📊 مستوى ${member.user.username}`)
        .setColor(0x2b2d31)
        .addFields(
          { name: 'المستوى', value: `${userData.level}`, inline: true },
          { name: 'XP', value: `${userData.xp}/${(userData.level + 1) * 100}`, inline: true },
          { name: 'الرسائل', value: `${userData.messages}`, inline: true }
        );
      if (generalImage) embed.setImage(generalImage);
      sentReply = await message.channel.send({ embeds: [embed] });
      deleteAfter(sentReply);
      return;
    }

    // ترتيب (يُحذف)
    if (cmd === 'ترتيب') {
      const top = await User.find({ guildId }).sort({ level: -1, xp: -1 }).limit(10);
      if (!top.length) {
        sentReply = await message.reply('📭 لا توجد بيانات مستويات.');
        deleteAfter(sentReply);
        return;
      }
      let desc = '';
      let rank = 1;
      for (const entry of top) {
        const member = message.guild.members.cache.get(entry.userId);
        const name = member ? member.user.username : `مستخدم ${entry.userId}`;
        desc += `#${rank} ${name} - المستوى ${entry.level} (XP: ${entry.xp})\n`;
        rank++;
      }
      const embed = new EmbedBuilder().setTitle('🏆 ترتيب المستويات').setColor(0x2b2d31).setDescription(desc).setFooter({ text: 'أعلى 10 أعضاء' });
      if (generalImage) embed.setImage(generalImage);
      sentReply = await message.channel.send({ embeds: [embed] });
      deleteAfter(sentReply);
      return;
    }

    // ===== معلومات, سيرفر, بينق (تُحذف) =====
    if (cmd === 'معلومات') {
      const member = message.mentions.members.first() || message.member;
      const embed = new EmbedBuilder().setTitle(`ℹ️ معلومات ${member.user.username}`).setColor(0x2b2d31)
        .setThumbnail(member.user.displayAvatarURL())
        .addFields(
          { name: '🆔 المعرف', value: member.id, inline: true },
          { name: '📅 تاريخ الانضمام', value: member.joinedAt.toDateString(), inline: true },
          { name: '📅 تاريخ الحساب', value: member.user.createdAt.toDateString(), inline: true },
          { name: '🎭 أعلى رتبة', value: member.roles.highest.toString(), inline: true },
          { name: '🔊 في روم صوتي', value: member.voice.channel ? member.voice.channel.name : 'لا', inline: true }
        );
      if (generalImage) embed.setImage(generalImage);
      sentReply = await message.channel.send({ embeds: [embed] });
      deleteAfter(sentReply);
      return;
    }

    if (cmd === 'سيرفر') {
      const embed = new EmbedBuilder().setTitle(message.guild.name).setColor(0x2b2d31)
        .addFields(
          { name: '👥 الأعضاء', value: `${message.guild.memberCount}`, inline: true },
          { name: '💬 القنوات', value: `${message.guild.channels.cache.size}`, inline: true },
          { name: '👑 المالك', value: `<@${message.guild.ownerId}>`, inline: true }
        )
        .setThumbnail(message.guild.iconURL());
      if (generalImage) embed.setImage(generalImage);
      sentReply = await message.channel.send({ embeds: [embed] });
      deleteAfter(sentReply);
      return;
    }

    if (cmd === 'بينق') {
      const embed = new EmbedBuilder().setColor(0x2b2d31).setDescription(`🏓 البينق: ${client.ws.ping}ms`);
      if (generalImage) embed.setImage(generalImage);
      sentReply = await message.channel.send({ embeds: [embed] });
      deleteAfter(sentReply);
      return;
    }

    // ===== تغيير_اسم (يُحذف) =====
    if (cmd === 'تغيير_اسم') {
      const userId = message.author.id;
      const last = await getNameCooldown(userId);
      if (last && Date.now() - last.getTime() < 5 * 60 * 60 * 1000) {
        const remaining = Math.ceil((5 * 60 * 60 * 1000 - (Date.now() - last.getTime())) / (60 * 60 * 1000));
        sentReply = await message.reply(`⏳ يمكنك تغيير اسمك بعد ${remaining} ساعة.`);
        deleteAfter(sentReply);
        return;
      }
      const embed = new EmbedBuilder().setTitle('✏️ تغيير الاسم').setDescription('اضغط على الزر أدناه لتغيير اسمك المستعار في السيرفر.').setColor(0x2b2d31).setFooter({ text: 'يمكنك تغيير اسمك مرة كل 5 ساعات.' });
      if (generalImage) embed.setImage(generalImage);
      const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('open_name_modal').setLabel('✏️ تغيير الاسم').setStyle(ButtonStyle.Secondary));
      sentReply = await message.channel.send({ embeds: [embed], components: [row] });
      deleteAfter(sentReply);
      return;
    }

    // ===== ردود تلقائية (تُحذف) =====
    if (cmd === 'رد_تلقائي') {
      if (!(await hasPermission(message.member, guildId))) {
        sentReply = await message.reply('❌ تحتاج صلاحية متحكم.');
        deleteAfter(sentReply);
        return;
      }
      const keyword = args[0];
      const reply = args.slice(1).join(' ');
      if (!keyword || !reply) {
        sentReply = await message.reply('⚠️ الصيغة: `!رد_تلقائي [الكلمة] [الرد]`');
        deleteAfter(sentReply);
        return;
      }
      const added = await addAutoReply(guildId, keyword, reply);
      await logToChannel(guildId, { title: '💬 إضافة رد تلقائي', color: 0x2b2d31, description: `**${message.author}** أضاف رداً تلقائياً:\n**${keyword}** → ${reply}` });
      const embed = new EmbedBuilder()
        .setTitle(added ? '✅ تم إضافة رد تلقائي' : '🔄 تم تحديث رد تلقائي')
        .setColor(0x2b2d31)
        .setDescription(`**الكلمة:** ${keyword}\n**الرد:** ${reply}`)
        .setFooter({ text: 'سيرد البوت تلقائياً عند كتابة هذه الكلمة.' });
      if (generalImage) embed.setImage(generalImage);
      sentReply = await message.channel.send({ embeds: [embed] });
      deleteAfter(sentReply);
      return;
    }

    if (cmd === 'رد_تلقائي_صورة') {
      if (!(await hasPermission(message.member, guildId))) {
        sentReply = await message.reply('❌ تحتاج صلاحية متحكم.');
        deleteAfter(sentReply);
        return;
      }
      const keyword = args[0];
      const image = args[args.length - 1];
      const reply = args.slice(1, -1).join(' ');
      if (!keyword || !reply || !image) {
        sentReply = await message.reply('⚠️ الصيغة: `!رد_تلقائي_صورة [الكلمة] [الرد] [رابط_الصورة]`');
        deleteAfter(sentReply);
        return;
      }
      if (!image.match(/^https?:\/\/.+/)) {
        sentReply = await message.reply('⚠️ الرابط غير صالح.');
        deleteAfter(sentReply);
        return;
      }
      const added = await addAutoReply(guildId, keyword, reply, image);
      await logToChannel(guildId, { title: '💬 إضافة رد تلقائي مع صورة', color: 0x2b2d31, description: `**${message.author}** أضاف رداً تلقائياً مع صورة:\n**${keyword}** → ${reply}` });
      const embed = new EmbedBuilder()
        .setTitle(added ? '✅ تم إضافة رد تلقائي مع صورة' : '🔄 تم تحديث رد تلقائي مع صورة')
        .setColor(0x2b2d31)
        .setDescription(`**الكلمة:** ${keyword}\n**الرد:** ${reply}`)
        .setImage(image)
        .setFooter({ text: 'سيرد البوت مع الصورة تلقائياً.' });
      if (generalImage) embed.setThumbnail(generalImage);
      sentReply = await message.channel.send({ embeds: [embed] });
      deleteAfter(sentReply);
      return;
    }

    if (cmd === 'حذف_رد_تلقائي') {
      if (!(await hasPermission(message.member, guildId))) {
        sentReply = await message.reply('❌ تحتاج صلاحية متحكم.');
        deleteAfter(sentReply);
        return;
      }
      const keyword = args.join(' ');
      if (!keyword) {
        sentReply = await message.reply('⚠️ اكتب الكلمة المفتاحية التي تريد حذفها.');
        deleteAfter(sentReply);
        return;
      }
      const removed = await removeAutoReply(guildId, keyword);
      if (!removed) {
        sentReply = await message.reply(`⚠️ لا يوجد رد تلقائي للكلمة "${keyword}".`);
        deleteAfter(sentReply);
        return;
      }
      await logToChannel(guildId, { title: '🗑️ حذف رد تلقائي', color: 0x2b2d31, description: `**${message.author}** حذف الرد التلقائي للكلمة **${keyword}**` });
      const embed = new EmbedBuilder()
        .setTitle('🗑️ تم حذف الرد التلقائي')
        .setColor(0x2b2d31)
        .setDescription(`تم حذف الرد التلقائي للكلمة: **${keyword}**`);
      if (generalImage) embed.setImage(generalImage);
      sentReply = await message.channel.send({ embeds: [embed] });
      deleteAfter(sentReply);
      return;
    }

    if (cmd === 'عرض_الردود') {
      const replies = await getAutoReplies(guildId);
      if (!replies.length) {
        sentReply = await message.reply('📭 لا توجد ردود تلقائية في هذا السيرفر.');
        deleteAfter(sentReply);
        return;
      }
      const list = replies.map((r, i) => `${i+1}. **${r.keyword}** → ${r.reply}${r.image ? ' (🖼️)' : ''}`).join('\n');
      const embed = new EmbedBuilder()
        .setTitle('💬 قائمة الردود التلقائية')
        .setColor(0x2b2d31)
        .setDescription(list)
        .setFooter({ text: `عدد الردود: ${replies.length}` });
      if (generalImage) embed.setImage(generalImage);
      sentReply = await message.channel.send({ embeds: [embed] });
      deleteAfter(sentReply);
      return;
    }

    // ===== قول, ايمبد, اعلان (تُحذف) =====
    if (cmd === 'قول') {
      const text = args.join(' ');
      if (!text) {
        sentReply = await message.reply('⚠️ اكتب النص.');
        deleteAfter(sentReply);
        return;
      }
      sentReply = await message.channel.send(text);
      deleteAfter(sentReply);
      return;
    }

    if (cmd === 'ايمبد') {
      const fullText = args.join(' ');
      if (!fullText) {
        sentReply = await message.reply('⚠️ الصيغة: `!ايمبد [العنوان] ، [الوصف]`');
        deleteAfter(sentReply);
        return;
      }
      const parts = fullText.split(/[،,]\s*/).map(s => s.trim());
      let title = 'بدون عنوان', description = fullText;
      if (parts.length >= 2) { title = parts[0]; description = parts.slice(1).join(' ، '); }
      const embed = new EmbedBuilder().setTitle(title).setDescription(description).setColor(0x2b2d31).setTimestamp();
      const imageMatch = description.match(/(https?:\/\/[^\s]+\.(?:png|jpg|jpeg|gif|webp))/i);
      if (imageMatch) { embed.setImage(imageMatch[1]); embed.setDescription(description.replace(imageMatch[1], '').trim() || 'بدون وصف'); }
      if (generalImage) embed.setThumbnail(generalImage);
      sentReply = await message.channel.send({ embeds: [embed] });
      deleteAfter(sentReply);
      return;
    }

    if (cmd === 'اعلان') {
      if (!(await hasPermission(message.member, guildId))) {
        sentReply = await message.reply('❌ تحتاج صلاحية متحكم.');
        deleteAfter(sentReply);
        return;
      }
      let mentionType = 'everyone';
      let text = args.join(' ');
      if (args[0]?.toLowerCase() === 'here') { mentionType = 'here'; text = args.slice(1).join(' '); }
      if (!text) {
        sentReply = await message.reply('⚠️ اكتب نص الإعلان.');
        deleteAfter(sentReply);
        return;
      }
      const embed = new EmbedBuilder().setTitle('📢 إعلان').setDescription(text).setColor(0x2b2d31).setTimestamp().setFooter({ text: `بواسطة ${message.author.tag}` });
      if (generalImage) embed.setImage(generalImage);
      sentReply = await message.channel.send({ content: mentionType === 'everyone' ? '@everyone' : '@here', embeds: [embed] });
      deleteAfter(sentReply);
      return;
    }

    // ===== إيقاف (يُحذف) =====
    if (cmd === 'إيقاف') {
      if (!OWNER_ID || message.author.id !== OWNER_ID) {
        sentReply = await message.reply('❌ هذا الأمر للمالك فقط.');
        deleteAfter(sentReply);
        return;
      }
      sentReply = await message.reply('🛑 جاري الإيقاف...');
      deleteAfter(sentReply);
      process.exit(0);
      return;
    }

    // ===== باقي الأوامر الإشرافية (حظر, طرد, كتم, فك_كتم, تحذير, ابطال_تحذيرات, مسح, قفل, فتح,
    // اعطاء_رتبة, سحب_رتبة, نقل_كل, طرد_صوتي, كتم_صوتي, فك_كتم_صوتي,
    // انشاء_قناة, حذف_قناة, تغيير_اسم_قناة, تثبيت, الغاء_تثبيت) =====
    // جميعها ستُحذف تلقائياً لأن deleteDelay = 5000 لها

    // يمكنك إضافة الأوامر الإشرافية هنا بنفس الكود السابق،
    // أو يمكنك تركها كـ else إذا لم تطابق أي أمر سابق.

  } catch (error) {
    console.error('❌ خطأ في تنفيذ الأمر:', error);
    sentReply = await message.reply('❌ حدث خطأ أثناء تنفيذ الأمر.').catch(() => {});
    if (sentReply) deleteAfter(sentReply);
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

      const color = parseInt(config.suggestionsColor?.replace('#', '') || '2b2d31', 16);
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
        color: 0x2b2d31,
        description: `**المستخدم:** ${interaction.user.tag}\n**العنوان:** ${title}`,
        footer: 'الاقتراحات',
      });
    }

    // أزرار الاقتراحات
    if (interaction.isButton()) {
      if (['suggest_accept', 'suggest_reject', 'suggest_comment'].includes(interaction.customId)) {
        if (!(await hasPermission(interaction.member, interaction.guild.id))) {
          return interaction.reply({ content: '❌ هذا الزر للمشرفين فقط.', ephemeral: true });
        }

        const msg = interaction.message;
        const embed = msg.embeds[0];
        if (!embed) return interaction.reply({ content: '❌ لا يوجد اقتراح.', ephemeral: true });

        let newEmbed = EmbedBuilder.from(embed);
        let action = '';
        let color = 0x2b2d31;
        let footer = '';

        if (interaction.customId === 'suggest_accept') {
          action = '✅ تم قبول الاقتراح';
          color = 0x2b2d31;
          footer = `قبل بواسطة ${interaction.user.tag}`;
        } else if (interaction.customId === 'suggest_reject') {
          action = '❌ تم رفض الاقتراح';
          color = 0x2b2d31;
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
        const last = await getNameCooldown(userId);
        if (last && Date.now() - last.getTime() < 5 * 60 * 60 * 1000) {
          const remaining = Math.ceil((5 * 60 * 60 * 1000 - (Date.now() - last.getTime())) / (60 * 60 * 1000));
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
        const embed = new EmbedBuilder().setTitle('📋 ملخص التذكرة المغلقة').setColor(0x2b2d31)
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
        await logToChannel(interaction.guild.id, { title: '🔒 إغلاق تذكرة', color: 0x2b2d31, description: `**المستخدم:** ${interaction.user}\n**القناة:** ${channel.name}\n**صاحب التذكرة:** ${ticketOwnerId ? `<@${ticketOwnerId}>` : 'غير معروف'}`, footer: 'نظام التذاكر' });
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
        await setNameCooldown(interaction.user.id);
        await logToChannel(interaction.guild.id, { title: '✏️ تغيير اسم', color: 0x2b2d31, description: `**المستخدم:** ${interaction.user}\n**الاسم القديم:** ${oldName}\n**الاسم الجديد:** ${newName}`, footer: 'تغيير الاسم' });
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
      newEmbed.setColor(0x2b2d31).setFooter({ text: `علق بواسطة ${interaction.user.tag} | ${new Date().toISOString()}` });

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

    // قائمة التذاكر
    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_menu') {
      await interaction.deferReply({ ephemeral: true });
      const selected = interaction.values[0];
      const guild = interaction.guild;
      const member = interaction.member;
      const config = await getGuildConfig(guild.id);
      const generalImage = getGeneralImage(guild, config);
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
        const embed = new EmbedBuilder().setTitle(`🎫 تذكرة - ${selected}`).setDescription(`مرحباً ${member}!\nالقسم: **${selected}**\nيرجى شرح مشكلتك، سيرد عليك فريق الدعم قريباً.`).setColor(0x2b2d31).setTimestamp();
        if (generalImage) embed.setImage(generalImage);
        let mention = section.roleId ? `${guild.roles.cache.get(section.roleId)}` : '';
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('close_ticket').setLabel('🔒 إغلاق التذكرة').setStyle(ButtonStyle.Secondary));
        await channel.send({ content: `${member} ${mention}`.trim(), embeds: [embed], components: [row] });
        await logToChannel(guild.id, { title: '🎫 فتح تذكرة', color: 0x2b2d31, description: `**${member.user.tag}** فتح تذكرة في قسم **${selected}**\nالقناة: ${channel}`, footer: 'نظام التذاكر' });
        await interaction.editReply({ content: `✅ تم إنشاء تذكرتك: ${channel}`, ephemeral: true });
      } catch (error) { await interaction.editReply({ content: '❌ حدث خطأ في إنشاء التذكرة.', ephemeral: true }); }
    }

  } catch (error) {
    console.error('❌ خطأ في معالج التفاعلات:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: '❌ حدث خطأ.', ephemeral: true }).catch(() => {});
    }
  }
});

// ============================================================
// ========== تشغيل البوت ==========
// ============================================================

client.login(TOKEN).catch((err) => {
  console.error('❌ فشل تسجيل الدخول:', err);
  process.exit(1);
});
