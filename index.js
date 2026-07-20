const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  PermissionsBitField,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActivityType,
} = require('discord.js');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const express = require('express');
const fs = require('fs');
const ytdl = require('ytdl-core');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => res.send('🟢 Bot is online'));
app.listen(port, () => console.log(`✅ Web server on port ${port}`));

const TOKEN = process.env.DISCORD_TOKEN;
if (!TOKEN) { console.error('❌ DISCORD_TOKEN غير موجود'); process.exit(1); }
const OWNER_ID = process.env.OWNER_ID || null;

// ========== قاعدة البيانات ==========
const db = {
  config: {},
  nameCooldown: {},
  memberCount: {},
  ticketSettings: {},
  warns: {},
  autoLine: {},
  autoReplies: {},
  users: {},
  levelRoles: {},
  controllers: {},
};

function saveDB() { try { fs.writeFileSync('./database.json', JSON.stringify(db, null, 2)); } catch (e) {} }
function loadDB() { try { const data = fs.readFileSync('./database.json', 'utf8'); Object.assign(db, JSON.parse(data)); } catch (e) {} }
loadDB();
setInterval(saveDB, 60000);

// ========== دوال الصلاحيات ==========
function isOwner(userId) { return OWNER_ID ? userId === OWNER_ID : false; }
function isController(userId, guildId) {
  if (isOwner(userId)) return true;
  const controllers = db.controllers[guildId] || [];
  return controllers.includes(userId);
}
function hasPermission(member, guildId) {
  if (!member) return false;
  if (isOwner(member.id)) return true;
  return isController(member.id, guildId);
}

// ========== دوال الإعدادات ==========
function getGuildConfig(guildId) {
  if (!db.config[guildId]) {
    db.config[guildId] = {
      logChannel: null,
      welcomeChannel: null,
      welcomeMessage: 'أهلاً بك في السيرفر! 🎉',
      welcomeTitle: '🔥 مرحباً بك في المجتمع',
      welcomeImage: null,
      muteRole: null,
      joinRole: null,
      ticketPanelImage: null,
      rolesImage: null,
      bannerImage: null,
      generalImage: null,
      levelChannelId: null,
      autoDeleteChannel: null,
    };
  }
  return db.config[guildId];
}
function updateGuildConfig(guildId, data) {
  db.config[guildId] = { ...getGuildConfig(guildId), ...data };
}

// ========== دوال التذاكر ==========
function getTicketSettings(guildId) {
  if (!db.ticketSettings[guildId]) {
    db.ticketSettings[guildId] = {
      sections: [
        { name: '💻 دعم فني', roleId: null, emoji: '🛠️' },
        { name: '📢 شكوى', roleId: null, emoji: '⚠️' },
        { name: '💡 اقتراح', roleId: null, emoji: '💡' },
        { name: '📌 أخرى', roleId: null, emoji: '📂' },
      ],
      text: 'مرحباً بكم جميعاً في قسم التذاكر، لفتح تذكرة أرجو ضغط على القائمة أدناه واختيار التذكرة التي تناسبك.',
      image: 'https://i.imgur.com/GkKqN3G.png',
    };
  }
  return db.ticketSettings[guildId];
}
function saveTicketSettings(guildId, data) {
  db.ticketSettings[guildId] = data;
}

// ========== دوال التحذيرات ==========
function getWarns(userId, guildId) {
  const key = `${guildId}-${userId}`;
  return db.warns[key] || [];
}
function addWarn(userId, guildId, reason, moderator) {
  const key = `${guildId}-${userId}`;
  if (!db.warns[key]) db.warns[key] = [];
  db.warns[key].push({ reason, moderator, date: new Date().toISOString() });
  return db.warns[key].length;
}
function clearWarns(userId, guildId) {
  const key = `${guildId}-${userId}`;
  db.warns[key] = [];
}

// ========== دوال الأوتو لاين ==========
function getAutoLine(guildId) {
  if (!db.autoLine[guildId]) db.autoLine[guildId] = { channelId: null, text: null, image: null, enabled: false };
  return db.autoLine[guildId];
}
function setAutoLine(guildId, data) {
  db.autoLine[guildId] = { ...getAutoLine(guildId), ...data };
}

// ========== دوال الردود التلقائية ==========
function getAutoReplies(guildId) {
  if (!db.autoReplies[guildId]) db.autoReplies[guildId] = [];
  return db.autoReplies[guildId];
}
function addAutoReply(guildId, keyword, reply, image = null) {
  const replies = getAutoReplies(guildId);
  const existing = replies.find(r => r.keyword.toLowerCase() === keyword.toLowerCase());
  if (existing) { existing.reply = reply; existing.image = image; return false; }
  replies.push({ keyword, reply, image });
  return true;
}
function removeAutoReply(guildId, keyword) {
  const replies = getAutoReplies(guildId);
  const index = replies.findIndex(r => r.keyword.toLowerCase() === keyword.toLowerCase());
  if (index === -1) return false;
  replies.splice(index, 1);
  return true;
}
function findAutoReply(guildId, keyword) {
  const replies = getAutoReplies(guildId);
  return replies.find(r => keyword.toLowerCase().includes(r.keyword.toLowerCase()));
}

// ========== دوال المستويات ==========
function getLevelXP(level) { return (level + 1) * 100; }
function getUserData(userId, guildId) {
  if (!db.users[guildId]) db.users[guildId] = {};
  if (!db.users[guildId][userId]) db.users[guildId][userId] = { xp: 0, level: 0, messages: 0 };
  return db.users[guildId][userId];
}
function saveUserData(userId, guildId, data) {
  db.users[guildId][userId] = data;
}

// ========== دالة الصورة العامة ==========
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
  ],
});

client.once('ready', () => {
  console.log(`✅ البوت جاهز باسم ${client.user.tag}`);
  if (OWNER_ID) console.log(`👑 صاحب البوت: ${OWNER_ID}`);
  client.user.setActivity('🔥 !مساعدة | البوت', { type: ActivityType.Watching });
});

// ============================================================
// ========== نظام اللوق ==========
// ============================================================

async function logToChannel(guildId, data) {
  const config = getGuildConfig(guildId);
  if (!config.logChannel) return;
  const channel = client.channels.cache.get(config.logChannel);
  if (!channel) return;
  try {
    const embed = new EmbedBuilder()
      .setColor(data.color || 0xcc0000)
      .setTitle(data.title || '📋 سجل')
      .setDescription(data.description || '')
      .setTimestamp();
    if (data.footer && data.footer.trim().length > 0) embed.setFooter({ text: data.footer.trim() });
    if (data.fields) for (const f of data.fields) embed.addFields(f);
    if (data.thumbnail) embed.setThumbnail(data.thumbnail);
    if (data.image) embed.setImage(data.image);
    await channel.send({ embeds: [embed] });
  } catch (e) {
    await channel.send(`📋 **${data.title || 'سجل'}**\n${data.description || ''}`).catch(() => {});
  }
}

// ============================================================
// ========== نظام حذف الأوامر بعد 20 ثانية ==========
// ============================================================

async function autoDelete(msg, time = 20000) {
  setTimeout(async () => {
    try { await msg.delete(); } catch (e) {}
  }, time);
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
  const config = getGuildConfig(member.guild.id);
  if (!config.welcomeChannel) return;
  const channel = member.guild.channels.cache.get(config.welcomeChannel);
  if (!channel) return;
  const memberCount = member.guild.memberCount;
  db.memberCount[member.guild.id] = memberCount;
  const imageBuffer = await generateWelcomeImage(member, memberCount);
  const generalImage = getGeneralImage(member.guild, config);
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
});

client.on('guildMemberRemove', async (member) => {
  await logToChannel(member.guild.id, {
    title: '🚫 عضو غادر', color: 0xcc0000,
    description: `**${member.user.tag}** غادر السيرفر.`,
    thumbnail: member.user.displayAvatarURL(),
    footer: 'نظام الترحيب',
  });
});

client.on('messageDelete', async (message) => {
  if (!message.guild || message.author?.bot) return;
  await logToChannel(message.guild.id, {
    title: '🗑️ حذف رسالة', color: 0xcc0000,
    description: `**المستخدم:** ${message.author?.tag || 'غير معروف'}\n**القناة:** ${message.channel.name}\n**المحتوى:** ${message.content || 'غير مرئي'}`,
    footer: 'سجلات الرسائل',
  });
});

client.on('messageUpdate', async (oldMessage, newMessage) => {
  if (!oldMessage.guild || oldMessage.author?.bot) return;
  if (oldMessage.content === newMessage.content) return;
  await logToChannel(oldMessage.guild.id, {
    title: '✏️ تعديل رسالة', color: 0xcc0000,
    description: `**المستخدم:** ${oldMessage.author?.tag || 'غير معروف'}\n**القناة:** ${oldMessage.channel.name}`,
    fields: [
      { name: '📜 النص القديم', value: oldMessage.content || 'فارغ', inline: false },
      { name: '📝 النص الجديد', value: newMessage.content || 'فارغ', inline: false },
    ],
    footer: 'سجلات الرسائل',
  });
});

// ============================================================
// ========== نظام المستويات ==========
// ============================================================

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  if (message.content.startsWith('!')) return;
  const guildId = message.guild.id;
  const config = getGuildConfig(guildId);
  if (config.levelChannelId && message.channel.id !== config.levelChannelId) return;
  const userId = message.author.id;
  const userData = getUserData(userId, guildId);
  userData.messages += 1;
  const gain = Math.floor(Math.random() * 15) + 5;
  userData.xp += gain;
  let currentLevel = userData.level;
  let requiredXP = getLevelXP(currentLevel);
  if (userData.xp >= requiredXP) {
    userData.level += 1;
    userData.xp = 0;
    try {
      const dmEmbed = new EmbedBuilder()
        .setTitle('🎉 مستوى جديد!')
        .setDescription(`مبروك! وصلت إلى المستوى **${userData.level}** في سيرفر **${message.guild.name}**!`)
        .setColor(0xcc0000)
        .setTimestamp()
        .setFooter({ text: 'استمر في التفاعل لترفع مستواك!' });
      const generalImage = getGeneralImage(message.guild, config);
      if (generalImage) dmEmbed.setThumbnail(generalImage);
      await message.author.send({ embeds: [dmEmbed] });
    } catch (error) {
      const levelChannelId = config.levelChannelId || message.channel.id;
      const levelChannel = message.guild.channels.cache.get(levelChannelId);
      if (levelChannel) {
        const embed = new EmbedBuilder()
          .setTitle('🎉 مستوى جديد!')
          .setDescription(`${message.author} وصل إلى المستوى **${userData.level}**!`)
          .setColor(0xcc0000)
          .setTimestamp();
        const generalImage = getGeneralImage(message.guild, config);
        if (generalImage) embed.setThumbnail(generalImage);
        await levelChannel.send({ embeds: [embed] });
      }
    }
    const levelRole = db.levelRoles?.[guildId]?.[userData.level];
    if (levelRole) {
      const role = message.guild.roles.cache.get(levelRole);
      if (role) {
        const member = await message.guild.members.fetch(userId).catch(() => null);
        if (member) await member.roles.add(role).catch(() => {});
      }
    }
  }
  saveUserData(userId, guildId, userData);
});

// ============================================================
// ========== نظام الأوتو لاين والردود التلقائية ==========
// ============================================================

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  if (message.content.startsWith('!')) return;
  const guildId = message.guild.id;
  const auto = getAutoLine(guildId);
  if (auto.enabled && auto.channelId && auto.text && message.channel.id === auto.channelId) {
    if (auto.image) {
      const embed = new EmbedBuilder().setDescription(auto.text).setColor(0xcc0000).setImage(auto.image).setTimestamp();
      await message.reply({ embeds: [embed] }).catch(() => {});
    } else {
      await message.reply(auto.text).catch(() => {});
    }
    return;
  }
  const autoReply = findAutoReply(guildId, message.content);
  if (autoReply) {
    if (autoReply.image) {
      const embed = new EmbedBuilder().setDescription(autoReply.reply).setColor(0xcc0000).setImage(autoReply.image).setTimestamp();
      await message.reply({ embeds: [embed] }).catch(() => {});
    } else {
      await message.reply(autoReply.reply).catch(() => {});
    }
  }
});

// ============================================================
// ========== نظام بوت الأغاني ==========
// ============================================================

const queue = new Map();

async function playSong(guildId, song) {
  const serverQueue = queue.get(guildId);
  if (!song) {
    serverQueue.connection.destroy();
    queue.delete(guildId);
    return;
  }
  try {
    const stream = ytdl(song.url, { filter: 'audioonly', quality: 'highestaudio' });
    const resource = createAudioResource(stream);
    const player = createAudioPlayer();
    serverQueue.connection.subscribe(player);
    player.play(resource);
    player.on(AudioPlayerStatus.Idle, () => {
      serverQueue.songs.shift();
      playSong(guildId, serverQueue.songs[0]);
    });
    await serverQueue.textChannel.send(`🎵 الآن يتم تشغيل: **${song.title}**`);
  } catch (e) {
    serverQueue.songs.shift();
    playSong(guildId, serverQueue.songs[0]);
  }
}

// ============================================================
// ========== الأوامر الرئيسية ==========
// ============================================================

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  if (!message.content.startsWith('!')) return;
  const args = message.content.slice(1).trim().split(/ +/);
  const cmd = args.shift().toLowerCase();
  const guildId = message.guild.id;
  const config = getGuildConfig(guildId);
  const generalImage = getGeneralImage(message.guild, config);

  // ========== حذف الأمر بعد 20 ثانية ==========
  autoDelete(message, 20000);

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
        { name: '🎵 الأغاني', value: '`تشغيل [رابط/اسم]` `ايقاف` `تخطي` `قائمة_التشغيل`', inline: false },
        { name: '📥 التحميل', value: '`تحميل [رابط]`', inline: false },
        { name: '🎫 التذاكر', value: '`بانل` `عرض_تذكرة` `تعيين تذكرة` (للمتحكمين)', inline: false },
        { name: '🔔 رتب الإشعارات', value: '`رتب` (للمتحكمين)', inline: false },
        { name: '✏️ تغيير الاسم', value: '`تغيير_اسم`', inline: false },
        { name: 'ℹ️ معلومات', value: '`معلومات` `سيرفر` `بينق`', inline: false },
        { name: '⚙️ إعدادات', value: '`تعيين` (للمتحكمين)', inline: false }
      )
      .setFooter({ text: `🔥 البادئة: !` });
    if (generalImage) embed.setImage(generalImage);
    const msg = await message.channel.send({ embeds: [embed] });
    autoDelete(msg, 30000);
    return;
  }

  // ========== نظام التحكم ==========
  if (cmd === 'متحكم') {
    if (!isOwner(message.author.id)) return message.reply('❌ هذا الأمر للمالك فقط.');
    const member = message.mentions.members.first();
    if (!member) return message.reply('⚠️ منشن العضو.');
    if (member.id === client.user.id) return message.reply('❌ لا يمكنني جعل نفسي متحكماً.');
    if (isOwner(member.id)) return message.reply('❌ هذا هو مالك البوت، يملك صلاحية مطلقة مسبقاً.');
    if (isController(member.id, guildId)) return message.reply(`⚠️ ${member} متحكم بالفعل.`);
    if (!db.controllers[guildId]) db.controllers[guildId] = [];
    db.controllers[guildId].push(member.id);
    saveDB();
    await logToChannel(guildId, { title: '🛡️ تعيين متحكم', color: 0xcc0000, description: `**${message.author}** جعل ${member} متحكماً.` });
    await message.reply(`✅ تم جعل ${member} متحكماً على البوت في هذا السيرفر.`);
    return;
  }

  if (cmd === 'الغاء_متحكم') {
    if (!isOwner(message.author.id)) return message.reply('❌ هذا الأمر للمالك فقط.');
    const member = message.mentions.members.first();
    if (!member) return message.reply('⚠️ منشن العضو.');
    if (isOwner(member.id)) return message.reply('❌ لا يمكن إزالة صلاحية مالك البوت.');
    if (!isController(member.id, guildId)) return message.reply(`⚠️ ${member} ليس متحكماً.`);
    if (!db.controllers[guildId]) db.controllers[guildId] = [];
    db.controllers[guildId] = db.controllers[guildId].filter(id => id !== member.id);
    saveDB();
    await logToChannel(guildId, { title: '🛡️ إلغاء متحكم', color: 0xcc0000, description: `**${message.author}** ألغى صلاحية ${member}.` });
    await message.reply(`✅ تم إلغاء صلاحية التحكم عن ${member}.`);
    return;
  }

  if (cmd === 'قائمة_المتحكمين') {
    const controllers = db.controllers[guildId] || [];
    if (!controllers.length) return message.reply('📋 لا يوجد متحكمون في هذا السيرفر.');
    const list = controllers.map(id => `<@${id}>`).join('\n');
    const embed = new EmbedBuilder().setTitle('🛡️ قائمة المتحكمين').setColor(0xcc0000).setDescription(list).setTimestamp();
    if (generalImage) embed.setImage(generalImage);
    await message.channel.send({ embeds: [embed] });
    return;
  }

  // ========== بوت الأغاني ==========
  if (cmd === 'تشغيل') {
    if (!hasPermission(message.member, guildId)) return message.reply('❌ تحتاج صلاحية متحكم.');
    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) return message.reply('⚠️ أنت لست في روم صوتي.');
    const song = args.join(' ');
    if (!song) return message.reply('⚠️ أدخل رابط أو اسم الأغنية.');
    const serverQueue = queue.get(guildId);
    let songInfo;
    try { songInfo = await ytdl.getInfo(song); } catch (e) { return message.reply('❌ تعذر العثور على الأغنية.'); }
    const songData = {
      title: songInfo.videoDetails.title,
      url: songInfo.videoDetails.video_url,
    };
    if (!serverQueue) {
      const queueConstruct = {
        textChannel: message.channel,
        voiceChannel: voiceChannel,
        connection: null,
        songs: [],
        volume: 5,
        playing: true,
      };
      queue.set(guildId, queueConstruct);
      queueConstruct.songs.push(songData);
      try {
        const connection = joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId: guildId,
          adapterCreator: message.guild.voiceAdapterCreator,
        });
        queueConstruct.connection = connection;
        await playSong(guildId, queueConstruct.songs[0]);
      } catch (err) {
        queue.delete(guildId);
        return message.reply(`❌ فشل الاتصال: ${err}`);
      }
    } else {
      serverQueue.songs.push(songData);
      await message.reply(`✅ تم إضافة **${songData.title}** إلى قائمة التشغيل.`);
    }
    return;
  }

  if (cmd === 'ايقاف') {
    if (!hasPermission(message.member, guildId)) return message.reply('❌ تحتاج صلاحية متحكم.');
    const serverQueue = queue.get(guildId);
    if (!serverQueue) return message.reply('⚠️ لا توجد أغنية قيد التشغيل.');
    serverQueue.songs = [];
    serverQueue.connection.destroy();
    queue.delete(guildId);
    await message.reply('⏹️ تم إيقاف التشغيل.');
    return;
  }

  if (cmd === 'تخطي') {
    if (!hasPermission(message.member, guildId)) return message.reply('❌ تحتاج صلاحية متحكم.');
    const serverQueue = queue.get(guildId);
    if (!serverQueue) return message.reply('⚠️ لا توجد أغنية قيد التشغيل.');
    serverQueue.songs.shift();
    await playSong(guildId, serverQueue.songs[0]);
    await message.reply('⏭️ تم تخطي الأغنية.');
    return;
  }

  if (cmd === 'قائمة_التشغيل') {
    const serverQueue = queue.get(guildId);
    if (!serverQueue || !serverQueue.songs.length) return message.reply('📭 قائمة التشغيل فارغة.');
    const list = serverQueue.songs.map((s, i) => `${i+1}. ${s.title}`).join('\n');
    const embed = new EmbedBuilder().setTitle('🎵 قائمة التشغيل').setColor(0xcc0000).setDescription(list).setTimestamp();
    if (generalImage) embed.setImage(generalImage);
    await message.channel.send({ embeds: [embed] });
    return;
  }

  // ========== نظام التحميل ==========
  if (cmd === 'تحميل') {
    if (!hasPermission(message.member, guildId)) return message.reply('❌ تحتاج صلاحية متحكم.');
    const url = args.join(' ');
    if (!url) return message.reply('⚠️ أدخل رابط التحميل.');
    try {
      const info = await ytdl.getInfo(url);
      const embed = new EmbedBuilder()
        .setTitle('📥 جاري التحميل...')
        .setDescription(`**${info.videoDetails.title}**`)
        .setColor(0xcc0000)
        .setTimestamp();
      if (generalImage) embed.setImage(generalImage);
      await message.channel.send({ embeds: [embed] });
      const stream = ytdl(url, { filter: 'audioonly', quality: 'highestaudio' });
      const fileName = `${info.videoDetails.title.replace(/[^a-zA-Z0-9]/g, '_')}.mp3`;
      const filePath = `./temp/${fileName}`;
      if (!fs.existsSync('./temp')) fs.mkdirSync('./temp');
      const writeStream = fs.createWriteStream(filePath);
      stream.pipe(writeStream);
      writeStream.on('finish', async () => {
        await message.channel.send({ files: [filePath] });
        fs.unlinkSync(filePath);
      });
    } catch (e) {
      await message.reply('❌ فشل التحميل.');
    }
    return;
  }

  // ========== اختبار اللوق ==========
  if (cmd === 'اختبار_لوق') {
    if (!hasPermission(message.member, guildId)) return message.reply('❌ تحتاج صلاحية متحكم.');
    if (!config.logChannel) return message.reply('⚠️ لم يتم تعيين قناة اللوق.');
    const channel = message.guild.channels.cache.get(config.logChannel);
    if (!channel) return message.reply('❌ قناة اللوق غير موجودة.');
    await logToChannel(guildId, {
      title: '🧪 اختبار اللوق', color: 0xcc0000,
      description: `✅ اللوق يعمل بنجاح!\n**المنفذ:** ${message.author}`,
      footer: 'رسالة اختبار',
    });
    await message.reply('✅ تم إرسال رسالة اختبار إلى قناة اللوق.');
    return;
  }

  // ========== أوامر الترحيب ==========
  if (cmd === 'تعيين' && args[0]?.toLowerCase() === 'ترحيب') {
    if (!hasPermission(message.member, guildId)) return message.reply('❌ تحتاج صلاحية متحكم.');
    const channel = message.mentions.channels.first();
    if (!channel) {
      updateGuildConfig(guildId, { welcomeChannel: null });
      await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0xcc0000, description: `**${message.author}** ألغى قناة الترحيب.`, footer: 'الإعدادات' });
      return message.reply('✅ تم إلغاء تحديد قناة الترحيب.');
    }
    updateGuildConfig(guildId, { welcomeChannel: channel.id });
    await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0xcc0000, description: `**${message.author}** عيّن قناة الترحيب إلى ${channel}.`, footer: 'الإعدادات' });
    await message.reply(`✅ تم تعيين قناة الترحيب إلى ${channel}`);
    return;
  }

  if (cmd === 'تعيين' && args[0]?.toLowerCase() === 'رسالة_ترحيب') {
    if (!hasPermission(message.member, guildId)) return message.reply('❌ تحتاج صلاحية متحكم.');
    const text = args.slice(1).join(' ');
    if (!text) return message.reply('⚠️ أدخل نص الترحيب الجديد.');
    updateGuildConfig(guildId, { welcomeMessage: text });
    await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0xcc0000, description: `**${message.author}** غيّر نص الترحيب إلى:\n${text}`, footer: 'الإعدادات' });
    await message.reply(`✅ تم تعيين نص الترحيب:\n${text}`);
    return;
  }

  if (cmd === 'تعيين' && args[0]?.toLowerCase() === 'صورة_ترحيب') {
    if (!hasPermission(message.member, guildId)) return message.reply('❌ تحتاج صلاحية متحكم.');
    const url = args.slice(1).join(' ');
    if (!url) {
      updateGuildConfig(guildId, { welcomeImage: null });
      await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0xcc0000, description: `**${message.author}** ألغى صورة الترحيب.`, footer: 'الإعدادات' });
      return message.reply('✅ تم إلغاء صورة الترحيب.');
    }
    updateGuildConfig(guildId, { welcomeImage: url });
    await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0xcc0000, description: `**${message.author}** عيّن صورة الترحيب: ${url}`, footer: 'الإعدادات' });
    await message.reply(`✅ تم تعيين صورة الترحيب: ${url}`);
    return;
  }

  if (cmd === 'تعيين' && args[0]?.toLowerCase() === 'عنوان_ترحيب') {
    if (!hasPermission(message.member, guildId)) return message.reply('❌ تحتاج صلاحية متحكم.');
    const text = args.slice(1).join(' ');
    if (!text) return message.reply('⚠️ أدخل العنوان الجديد.');
    updateGuildConfig(guildId, { welcomeTitle: text });
    await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0xcc0000, description: `**${message.author}** غيّر عنوان الترحيب إلى: "${text}"`, footer: 'الإعدادات' });
    await message.reply(`✅ تم تعيين عنوان الترحيب: "${text}"`);
    return;
  }

  // ========== تعيين قناة اللوق ==========
  if (cmd === 'تعيين' && args[0]?.toLowerCase() === 'سجلات') {
    if (!hasPermission(message.member, guildId)) return message.reply('❌ تحتاج صلاحية متحكم.');
    const channel = message.mentions.channels.first();
    if (!channel) {
      updateGuildConfig(guildId, { logChannel: null });
      return message.reply('✅ تم إلغاء تعيين قناة اللوق.');
    }
    updateGuildConfig(guildId, { logChannel: channel.id });
    await logToChannel(guildId, { title: '📋 تم تعيين قناة اللوق', color: 0xcc0000, description: `**${message.author}** عيّن قناة اللوق إلى ${channel}`, footer: 'الإعدادات' });
    await message.reply(`✅ تم تعيين قناة اللوق إلى ${channel}`);
    return;
  }

  // ========== روم الليفل ==========
  if (cmd === 'تعيين' && args[0]?.toLowerCase() === 'روم_ليفل') {
    if (!hasPermission(message.member, guildId)) return message.reply('❌ تحتاج صلاحية متحكم.');
    const channel = message.mentions.channels.first();
    if (!channel) {
      updateGuildConfig(guildId, { levelChannelId: null });
      await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0xcc0000, description: `**${message.author}** ألغى قناة الليفل.`, footer: 'الإعدادات' });
      return message.reply('✅ تم إلغاء تحديد قناة الليفل.');
    }
    updateGuildConfig(guildId, { levelChannelId: channel.id });
    await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0xcc0000, description: `**${message.author}** عيّن قناة الليفل إلى ${channel}.`, footer: 'الإعدادات' });
    await message.reply(`✅ تم تعيين قناة الليفل إلى ${channel}`);
    return;
  }

  // ========== مستوى ==========
  if (cmd === 'مستوى') {
    const member = message.mentions.members.first() || message.member;
    const userData = getUserData(member.id, guildId);
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
    const guildUsers = db.users?.[guildId];
    if (!guildUsers || Object.keys(guildUsers).length === 0) return message.reply('📭 لا توجد بيانات مستويات.');
    const sorted = Object.entries(guildUsers).sort((a, b) => b[1].level - a[1].level || b[1].xp - a[1].xp).slice(0, 10);
    let desc = '';
    for (const [id, data] of sorted) {
      const member = message.guild.members.cache.get(id);
      const name = member ? member.user.username : `مستخدم ${id}`;
      desc += `#${sorted.indexOf([id, data]) + 1} ${name} - المستوى ${data.level} (XP: ${data.xp})\n`;
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
    await message.delete().catch(() => {});
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
    await message.delete().catch(() => {});
    return;
  }

  // ========== اعلان ==========
  if (cmd === 'اعلان') {
    if (!hasPermission(message.member, guildId)) return message.reply('❌ تحتاج صلاحية متحكم.');
    let mentionType = 'everyone';
    let text = args.join(' ');
    if (args[0]?.toLowerCase() === 'here') { mentionType = 'here'; text = args.slice(1).join(' '); }
    if (!text) return message.reply('⚠️ اكتب نص الإعلان.');
    const embed = new EmbedBuilder().setTitle('📢 إعلان').setDescription(text).setColor(0xcc0000).setTimestamp().setFooter({ text: `بواسطة ${message.author.tag}` });
    if (generalImage) embed.setImage(generalImage);
    await message.channel.send({ content: mentionType === 'everyone' ? '@everyone' : '@here', embeds: [embed] });
    await message.delete().catch(() => {});
    return;
  }

  // ========== الإدارة ==========
  if (cmd === 'حظر') {
    if (!hasPermission(message.member, guildId)) return message.reply('❌ تحتاج صلاحية متحكم.');
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
    if (!hasPermission(message.member, guildId)) return message.reply('❌ تحتاج صلاحية متحكم.');
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
    if (!hasPermission(message.member, guildId)) return message.reply('❌ تحتاج صلاحية متحكم.');
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
    if (!hasPermission(message.member, guildId)) return message.reply('❌ تحتاج صلاحية متحكم.');
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
    if (!hasPermission(message.member, guildId)) return message.reply('❌ تحتاج صلاحية متحكم.');
    const member = message.mentions.members.first();
    if (!member) return message.reply('⚠️ منشن العضو.');
    const reason = args.join(' ') || 'لا يوجد سبب';
    const count = addWarn(member.id, guildId, reason, message.author.id);
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
    if (!hasPermission(message.member, guildId)) return message.reply('❌ تحتاج صلاحية متحكم.');
    const member = message.mentions.members.first();
    if (!member) return message.reply('⚠️ منشن العضو.');
    clearWarns(member.id, guildId);
    const embed = new EmbedBuilder().setTitle('✅ تم إبطال التحذيرات').setColor(0xcc0000).setDescription(`تم إلغاء كل تحذيرات ${member.user.tag}.`);
    if (generalImage) embed.setImage(generalImage);
    await message.channel.send({ embeds: [embed] });
    await logToChannel(guildId, { title: '✅ إبطال تحذيرات', color: 0xcc0000, description: `**المنفذ:** ${message.author}\n**المستهدف:** ${member.user.tag}` });
    return;
  }

  if (cmd === 'مسح') {
    if (!hasPermission(message.member, guildId)) return message.reply('❌ تحتاج صلاحية متحكم.');
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
    if (!hasPermission(message.member, guildId)) return message.reply('❌ تحتاج صلاحية متحكم.');
    await message.channel.permissionOverwrites.create(message.guild.id, { SendMessages: false });
    const embed = new EmbedBuilder().setTitle('🔒 تم قفل القناة').setColor(0xcc0000).setDescription(`تم قفل ${message.channel}`);
    if (generalImage) embed.setImage(generalImage);
    await message.channel.send({ embeds: [embed] });
    await logToChannel(guildId, { title: '🔒 قفل قناة', color: 0xcc0000, description: `**المنفذ:** ${message.author}\n**القناة:** ${message.channel.name}` });
    return;
  }

  if (cmd === 'فتح') {
    if (!hasPermission(message.member, guildId)) return message.reply('❌ تحتاج صلاحية متحكم.');
    await message.channel.permissionOverwrites.delete(message.guild.id);
    const embed = new EmbedBuilder().setTitle('🔓 تم فتح القناة').setColor(0xcc0000).setDescription(`تم فتح ${message.channel}`);
    if (generalImage) embed.setImage(generalImage);
    await message.channel.send({ embeds: [embed] });
    await logToChannel(guildId, { title: '🔓 فتح قناة', color: 0xcc0000, description: `**المنفذ:** ${message.author}\n**القناة:** ${message.channel.name}` });
    return;
  }

  // ========== إدارة الرتب ==========
  if (cmd === 'اعطاء_رتبة') {
    if (!hasPermission(message.member, guildId)) return message.reply('❌ تحتاج صلاحية متحكم.');
    const member = message.mentions.members.first();
    if (!member) return message.reply('⚠️ منشن العضو.');
    const role = message.mentions.roles.first();
    if (!role) return message.reply('⚠️ منشن الرتبة.');
    if (role.position >= message.member.roles.highest.position && !isOwner(message.author.id))
      return message.reply('❌ لا يمكنك إعطاء رتبة أعلى من رتبتك.');
    await member.roles.add(role);
    const embed = new EmbedBuilder().setTitle('✅ تم إعطاء الرتبة').setColor(0xcc0000).setDescription(`تم إعطاء ${member} رتبة ${role}`);
    if (generalImage) embed.setImage(generalImage);
    await message.channel.send({ embeds: [embed] });
    await logToChannel(guildId, { title: '🎭 إعطاء رتبة', color: 0xcc0000, description: `**المنفذ:** ${message.author}\n**المستهدف:** ${member.user.tag}\n**الرتبة:** ${role.name}` });
    return;
  }

  if (cmd === 'سحب_رتبة') {
    if (!hasPermission(message.member, guildId)) return message.reply('❌ تحتاج صلاحية متحكم.');
    const member = message.mentions.members.first();
    if (!member) return message.reply('⚠️ منشن العضو.');
    const role = message.mentions.roles.first();
    if (!role) return message.reply('⚠️ منشن الرتبة.');
    if (role.position >= message.member.roles.highest.position && !isOwner(message.author.id))
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
    if (!hasPermission(message.member, guildId)) return message.reply('❌ تحتاج صلاحية متحكم.');
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
    if (!hasPermission(message.member, guildId)) return message.reply('❌ تحتاج صلاحية متحكم.');
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
    if (!hasPermission(message.member, guildId)) return message.reply('❌ تحتاج صلاحية متحكم.');
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
    if (!hasPermission(message.member, guildId)) return message.reply('❌ تحتاج صلاحية متحكم.');
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
    if (!hasPermission(message.member, guildId)) return message.reply('❌ تحتاج صلاحية متحكم.');
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
    if (!hasPermission(message.member, guildId)) return message.reply('❌ تحتاج صلاحية متحكم.');
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
    if (!hasPermission(message.member, guildId)) return message.reply('❌ تحتاج صلاحية متحكم.');
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
    if (!hasPermission(message.member, guildId)) return message.reply('❌ تحتاج صلاحية متحكم.');
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
    if (!hasPermission(message.member, guildId)) return message.reply('❌ تحتاج صلاحية متحكم.');
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

  // ========== التذاكر ==========
  if (cmd === 'عرض_تذكرة') {
    const settings = getTicketSettings(guildId);
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

  if (cmd === 'تعيين' && args[0]?.toLowerCase() === 'تذكرة') {
    if (!hasPermission(message.member, guildId)) return message.reply('❌ تحتاج صلاحية متحكم.');
    const sub = args[1]?.toLowerCase();
    const value = args.slice(2).join(' ');
    const settings = getTicketSettings(guildId);
    if (!sub) {
      const embed = new EmbedBuilder().setTitle('⚙️ إدارة التذاكر').setColor(0xcc0000)
        .addFields(
          { name: '➕ إضافة قسم', value: '`!تعيين تذكرة إضافة [الاسم] @دور :ايموجي:`' },
          { name: '🎨 تعيين إيموجي', value: '`!تعيين تذكرة تعيين_ايموجي [الاسم] :ايموجي:`' },
          { name: '➖ حذف قسم', value: '`!تعيين تذكرة حذف [الاسم]`' },
          { name: '📝 تغيير النص', value: '`!تعيين تذكرة نص [النص]`' },
          { name: '🖼️ تغيير الصورة', value: '`!تعيين تذكرة صورة [رابط]`' },
          { name: '👀 عرض الإعدادات', value: '`!عرض_تذكرة`' }
        )
        .setFooter({ text: 'الأقسام الحالية: ' + settings.sections.map(s => `${s.emoji || '📌'} ${s.name}`).join(', ') });
      if (generalImage) embed.setImage(generalImage);
      await message.channel.send({ embeds: [embed] });
      return;
    }
    if (sub === 'إضافة') {
      const parts = value.match(/^(.+?)\s+<@&(\d+)>\s*(\S+)?$/);
      if (!parts) return message.reply('⚠️ الصيغة: `!تعيين تذكرة إضافة [الاسم] @دور :ايموجي:`');
      const sectionName = parts[1].trim();
      const roleId = parts[2];
      const emoji = parts[3] || '📌';
      if (settings.sections.find(s => s.name === sectionName)) return message.reply(`⚠️ قسم "${sectionName}" موجود بالفعل.`);
      settings.sections.push({ name: sectionName, roleId, emoji });
      saveTicketSettings(guildId, settings);
      await logToChannel(guildId, { title: '🎫 إضافة قسم تذكرة', color: 0xcc0000, description: `**${message.author}** أضاف قسم **${sectionName}** مع دور <@&${roleId}> وإيموجي ${emoji}` });
      await message.reply(`✅ تم إضافة قسم **${sectionName}** مع دور <@&${roleId}> وإيموجي ${emoji}.`);
      return;
    }
    if (sub === 'تعيين_ايموجي') {
      const parts = value.match(/^(.+?)\s+(\S+)$/);
      if (!parts) return message.reply('⚠️ الصيغة: `!تعيين تذكرة تعيين_ايموجي [الاسم] :ايموجي:`');
      const sectionName = parts[1].trim();
      const emoji = parts[2];
      const section = settings.sections.find(s => s.name === sectionName);
      if (!section) return message.reply(`⚠️ قسم "${sectionName}" غير موجود.`);
      section.emoji = emoji;
      saveTicketSettings(guildId, settings);
      await logToChannel(guildId, { title: '🎨 تعيين إيموجي قسم', color: 0xcc0000, description: `**${message.author}** عيّن الإيموجي ${emoji} لقسم **${sectionName}**` });
      await message.reply(`✅ تم تعيين الإيموجي ${emoji} لقسم **${sectionName}**.`);
      return;
    }
    if (sub === 'حذف') {
      const sectionName = value.trim();
      const index = settings.sections.findIndex(s => s.name === sectionName);
      if (index === -1) return message.reply(`⚠️ قسم "${sectionName}" غير موجود.`);
      settings.sections.splice(index, 1);
      saveTicketSettings(guildId, settings);
      await logToChannel(guildId, { title: '🗑️ حذف قسم تذكرة', color: 0xcc0000, description: `**${message.author}** حذف قسم **${sectionName}**` });
      await message.reply(`✅ تم حذف قسم **${sectionName}**.`);
      return;
    }
    if (sub === 'نص') {
      if (!value) return message.reply('⚠️ أدخل النص الجديد.');
      settings.text = value;
      saveTicketSettings(guildId, settings);
      await logToChannel(guildId, { title: '📝 تغيير نص التذاكر', color: 0xcc0000, description: `**${message.author}** غيّر نص التذاكر إلى:\n${value}` });
      await message.reply(`✅ تم تغيير نص التذاكر:\n${value}`);
      return;
    }
    if (sub === 'صورة') {
      if (!value) return message.reply('⚠️ أدخل رابط الصورة.');
      settings.image = value;
      saveTicketSettings(guildId, settings);
      await logToChannel(guildId, { title: '🖼️ تغيير صورة التذاكر', color: 0xcc0000, description: `**${message.author}** غيّر صورة التذاكر إلى: ${value}` });
      await message.reply(`✅ تم تغيير صورة التذاكر: ${value}`);
      return;
    }
    await message.reply('⚠️ أمر غير معروف. استخدم `!تعيين تذكرة` لعرض التعليمات.');
    return;
  }

  if (cmd === 'بانل') {
    if (!hasPermission(message.member, guildId)) return message.reply('❌ تحتاج صلاحية متحكم.');
    const settings = getTicketSettings(guildId);
    const imageUrl = settings.image || 'https://i.imgur.com/GkKqN3G.png';
    const embed = new EmbedBuilder().setTitle('🎫 تذاكر دعم فني').setDescription(settings.text).setColor(0xcc0000).setImage(imageUrl).setFooter({ text: 'سيتم إنشاء قناة خاصة بك وسيرد عليك الفريق.' });
    if (generalImage) embed.setThumbnail(generalImage);
    const options = settings.sections.map(s => ({ label: s.name, value: s.name, emoji: s.emoji || '📌' }));
    if (!options.length) return message.reply('⚠️ لا توجد أقسام مضافة.');
    const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('ticket_menu').setPlaceholder('📌 اختر القسم...').addOptions(options));
    await message.channel.send({ embeds: [embed], components: [row] });
    await logToChannel(guildId, { title: '🎫 إنشاء لوحة تذاكر', color: 0xcc0000, description: `**${message.author}** أنشأ لوحة تذاكر.` });
    await message.reply('✅ تم إنشاء لوحة التذاكر.');
    return;
  }

  // ========== رتب الإشعارات ==========
  if (cmd === 'رتب') {
    if (!hasPermission(message.member, guildId)) return message.reply('❌ تحتاج صلاحية متحكم.');
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
    await message.reply('✅ تم إنشاء لوحة الرتب.');
    return;
  }

  // ========== تغيير الاسم ==========
  if (cmd === 'تغيير_اسم') {
    const userId = message.author.id;
    const last = db.nameCooldown[userId];
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

  // ========== الأوتو لاين ==========
  if (cmd === 'تعيين' && args[0]?.toLowerCase() === 'اوتر_لاين') {
    if (!hasPermission(message.member, guildId)) return message.reply('❌ تحتاج صلاحية متحكم.');
    const channel = message.mentions.channels.first();
    if (!channel) return message.reply('⚠️ منشن الروم.');
    const text = args.slice(2).join(' ');
    if (!text) return message.reply('⚠️ أدخل النص.');
    setAutoLine(guildId, { channelId: channel.id, text, enabled: true });
    await logToChannel(guildId, { title: '🤖 تعيين أوتو لاين', color: 0xcc0000, description: `**${message.author}** عيّن الأوتو لاين في ${channel}:\n${text}` });
    const embed = new EmbedBuilder().setTitle('✅ تم تعيين الأوتو لاين').setColor(0xcc0000).setDescription(`**الروم:** ${channel}\n**النص:** ${text}`).setFooter({ text: 'تم التفعيل تلقائياً.' });
    if (generalImage) embed.setImage(generalImage);
    await message.channel.send({ embeds: [embed] });
    return;
  }

  if (cmd === 'تعيين' && args[0]?.toLowerCase() === 'صورة_اوترلاين') {
    if (!hasPermission(message.member, guildId)) return message.reply('❌ تحتاج صلاحية متحكم.');
    const url = args.slice(1).join(' ');
    if (!url) return message.reply('⚠️ أدخل رابط الصورة.');
    setAutoLine(guildId, { image: url });
    await logToChannel(guildId, { title: '🖼️ تعيين صورة أوتو لاين', color: 0xcc0000, description: `**${message.author}** عيّن صورة الأوتو لاين: ${url}` });
    const embed = new EmbedBuilder().setTitle('✅ تم تعيين صورة الأوتو لاين').setColor(0xcc0000).setDescription(`[رابط الصورة](${url})`).setImage(url);
    if (generalImage) embed.setThumbnail(generalImage);
    await message.channel.send({ embeds: [embed] });
    return;
  }

  if (cmd === 'تعيين' && args[0]?.toLowerCase() === 'تفعيل_اوترلاين') {
    if (!hasPermission(message.member, guildId)) return message.reply('❌ تحتاج صلاحية متحكم.');
    setAutoLine(guildId, { enabled: true });
    await logToChannel(guildId, { title: '✅ تفعيل أوتو لاين', color: 0xcc0000, description: `**${message.author}** فعّل الأوتو لاين.` });
    const embed = new EmbedBuilder().setTitle('✅ تم تفعيل الأوتو لاين').setColor(0xcc0000).setDescription('تم تشغيل النظام. سيرد البوت تلقائياً في الروم المحدد.');
    if (generalImage) embed.setImage(generalImage);
    await message.channel.send({ embeds: [embed] });
    return;
  }

  if (cmd === 'تعيين' && args[0]?.toLowerCase() === 'تعطيل_اوترلاين') {
    if (!hasPermission(message.member, guildId)) return message.reply('❌ تحتاج صلاحية متحكم.');
    setAutoLine(guildId, { enabled: false });
    await logToChannel(guildId, { title: '⏹️ تعطيل أوتو لاين', color: 0xcc0000, description: `**${message.author}** عطّل الأوتو لاين.` });
    const embed = new EmbedBuilder().setTitle('⏹️ تم تعطيل الأوتو لاين').setColor(0xcc0000).setDescription('تم إيقاف النظام. لن يرد البوت تلقائياً حتى يتم تفعيله مرة أخرى.');
    if (generalImage) embed.setImage(generalImage);
    await message.channel.send({ embeds: [embed] });
    return;
  }

  // ========== الردود التلقائية ==========
  if (cmd === 'رد_تلقائي') {
    if (!hasPermission(message.member, guildId)) return message.reply('❌ تحتاج صلاحية متحكم.');
    const keyword = args[0];
    const reply = args.slice(1).join(' ');
    if (!keyword || !reply) return message.reply('⚠️ الصيغة: `!رد_تلقائي [الكلمة] [الرد]`');
    const added = addAutoReply(guildId, keyword, reply);
    await logToChannel(guildId, { title: '💬 إضافة رد تلقائي', color: 0xcc0000, description: `**${message.author}** أضاف رداً تلقائياً:\n**${keyword}** → ${reply}` });
    const embed = new EmbedBuilder().setTitle(added ? '✅ تم إضافة رد تلقائي' : '🔄 تم تحديث رد تلقائي').setColor(0xcc0000).setDescription(`**الكلمة:** ${keyword}\n**الرد:** ${reply}`).setFooter({ text: 'سيرد البوت تلقائياً عند كتابة هذه الكلمة.' });
    if (generalImage) embed.setImage(generalImage);
    await message.channel.send({ embeds: [embed] });
    return;
  }

  if (cmd === 'رد_تلقائي_صورة') {
    if (!hasPermission(message.member, guildId)) return message.reply('❌ تحتاج صلاحية متحكم.');
    const keyword = args[0];
    const image = args[args.length - 1];
    const reply = args.slice(1, -1).join(' ');
    if (!keyword || !reply || !image) return message.reply('⚠️ الصيغة: `!رد_تلقائي_صورة [الكلمة] [الرد] [رابط_الصورة]`');
    if (!image.match(/^https?:\/\/.+/)) return message.reply('⚠️ الرابط غير صالح.');
    const added = addAutoReply(guildId, keyword, reply, image);
    await logToChannel(guildId, { title: '💬 إضافة رد تلقائي مع صورة', color: 0xcc0000, description: `**${message.author}** أضاف رداً تلقائياً مع صورة:\n**${keyword}** → ${reply}` });
    const embed = new EmbedBuilder().setTitle(added ? '✅ تم إضافة رد تلقائي مع صورة' : '🔄 تم تحديث رد تلقائي مع صورة').setColor(0xcc0000).setDescription(`**الكلمة:** ${keyword}\n**الرد:** ${reply}`).setImage(image).setFooter({ text: 'سيرد البوت مع الصورة تلقائياً.' });
    if (generalImage) embed.setThumbnail(generalImage);
    await message.channel.send({ embeds: [embed] });
    return;
  }

  if (cmd === 'حذف_رد_تلقائي') {
    if (!hasPermission(message.member, guildId)) return message.reply('❌ تحتاج صلاحية متحكم.');
    const keyword = args.join(' ');
    if (!keyword) return message.reply('⚠️ اكتب الكلمة المفتاحية.');
    const removed = removeAutoReply(guildId, keyword);
    if (!removed) return message.reply(`⚠️ لا يوجد رد تلقائي للكلمة "${keyword}".`);
    await logToChannel(guildId, { title: '🗑️ حذف رد تلقائي', color: 0xcc0000, description: `**${message.author}** حذف الرد التلقائي للكلمة **${keyword}**` });
    const embed = new EmbedBuilder().setTitle('🗑️ تم حذف الرد التلقائي').setColor(0xcc0000).setDescription(`تم حذف الرد التلقائي للكلمة: **${keyword}**`);
    if (generalImage) embed.setImage(generalImage);
    await message.channel.send({ embeds: [embed] });
    return;
  }

  if (cmd === 'عرض_الردود') {
    const replies = getAutoReplies(guildId);
    if (!replies.length) return message.reply('📭 لا توجد ردود تلقائية في هذا السيرفر.');
    const list = replies.map((r, i) => `${i+1}. **${r.keyword}** → ${r.reply}${r.image ? ' (🖼️)' : ''}`).join('\n');
    const embed = new EmbedBuilder().setTitle('💬 قائمة الردود التلقائية').setColor(0xcc0000).setDescription(list).setFooter({ text: `عدد الردود: ${replies.length}` });
    if (generalImage) embed.setImage(generalImage);
    await message.channel.send({ embeds: [embed] });
    return;
  }

  // ========== الإعدادات العامة ==========
  if (cmd === 'تعيين') {
    if (args[0]?.toLowerCase() === 'تذكرة' || args[0]?.toLowerCase() === 'اوتر_لاين' ||
        args[0]?.toLowerCase() === 'صورة_اوترلاين' || args[0]?.toLowerCase() === 'تفعيل_اوترلاين' ||
        args[0]?.toLowerCase() === 'تعطيل_اوترلاين' || args[0]?.toLowerCase() === 'روم_ليفل' ||
        args[0]?.toLowerCase() === 'ترحيب' || args[0]?.toLowerCase() === 'رسالة_ترحيب' ||
        args[0]?.toLowerCase() === 'صورة_ترحيب' || args[0]?.toLowerCase() === 'سجلات' ||
        args[0]?.toLowerCase() === 'عنوان_ترحيب') return;
    if (!hasPermission(message.member, guildId)) return message.reply('❌ تحتاج صلاحية متحكم.');
    const sub = args[0]?.toLowerCase();
    const value = args.slice(1).join(' ');
    if (sub === 'دور_دخول') {
      const role = message.mentions.roles.first();
      if (!role) return message.reply('⚠️ منشن الدور.');
      updateGuildConfig(guildId, { joinRole: role.id });
      await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0xcc0000, description: `**${message.author}** عيّن دور الدخول إلى ${role.name}.`, footer: 'الإعدادات' });
      await message.reply(`✅ تم تعيين دور الدخول إلى ${role}`);
    } else if (sub === 'صورة_بانل') {
      if (!value) return message.reply('⚠️ أدخل رابط الصورة.');
      updateGuildConfig(guildId, { ticketPanelImage: value });
      await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0xcc0000, description: `**${message.author}** عيّن صورة البانل: ${value}`, footer: 'الإعدادات' });
      await message.reply(`✅ تم تعيين صورة البانل: ${value}`);
    } else if (sub === 'صورة_رتب') {
      if (!value) return message.reply('⚠️ أدخل رابط الصورة.');
      updateGuildConfig(guildId, { rolesImage: value });
      await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0xcc0000, description: `**${message.author}** عيّن صورة رتب الإشعارات: ${value}`, footer: 'الإعدادات' });
      await message.reply(`✅ تم تعيين صورة رتب الإشعارات: ${value}`);
    } else if (sub === 'صورة_بنر') {
      if (!value) return message.reply('⚠️ أدخل رابط الصورة.');
      updateGuildConfig(guildId, { bannerImage: value });
      await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0xcc0000, description: `**${message.author}** عيّن صورة البنر: ${value}`, footer: 'الإعدادات' });
      await message.reply(`✅ تم تعيين صورة البنر: ${value}`);
    } else if (sub === 'صورة_عامة') {
      if (!value) return message.reply('⚠️ أدخل رابط الصورة.');
      updateGuildConfig(guildId, { generalImage: value });
      await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0xcc0000, description: `**${message.author}** عيّن الصورة العامة: ${value}`, footer: 'الإعدادات' });
      await message.reply(`✅ تم تعيين الصورة العامة: ${value}`);
    } else {
      await message.reply('⚠️ الأوامر المتاحة: `!تعيين دور_دخول @دور` ، `!تعيين صورة_بانل رابط` ، `!تعيين صورة_رتب رابط` ، `!تعيين صورة_بنر رابط` ، `!تعيين صورة_عامة رابط`');
    }
    return;
  }

  // ========== إيقاف البوت ==========
  if (cmd === 'إيقاف') {
    if (!isOwner(message.author.id)) return message.reply('❌ هذا الأمر للمالك فقط.');
    await message.reply('🛑 جاري الإيقاف...');
    process.exit(0);
    return;
  }
});

// ============================================================
// ========== معالج التفاعلات ==========
// ============================================================

client.on('interactionCreate', async (interaction) => {
  if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_menu') {
    await interaction.deferReply({ ephemeral: true });
    const selected = interaction.values[0];
    const guild = interaction.guild;
    const member = interaction.member;
    const config = getGuildConfig(guild.id);
    const generalImage = getGeneralImage(guild, config);
    const settings = getTicketSettings(guild.id);
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

  if (interaction.isButton()) {
    if (['role_game', 'role_event', 'role_ajr'].includes(interaction.customId)) {
      const roleMap = { role_game: 'Game Notice', role_event: 'Event Notice', role_ajr: 'Ajr Notice' };
      const roleName = roleMap[interaction.customId];
      const role = interaction.guild.roles.cache.find(r => r.name === roleName);
      if (!role) return interaction.reply({ content: `❌ رتبة "${roleName}" غير موجودة.`, ephemeral: true });
      const member = interaction.member;
      if (member.roles.cache.has(role.id)) { await member.roles.remove(role); await interaction.reply({ content: `✅ تم إزالة رتبة ${roleName}.`, ephemeral: true }); }
      else { await member.roles.add(role); await interaction.reply({ content: `✅ تم منحك رتبة ${roleName}.`, ephemeral: true }); }
    }
    if (interaction.customId === 'open_name_modal') {
      const userId = interaction.user.id;
      const last = db.nameCooldown[userId];
      if (last && Date.now() - last < 5 * 60 * 60 * 1000) {
        const remaining = Math.ceil((5 * 60 * 60 * 1000 - (Date.now() - last)) / (60 * 60 * 1000));
        return interaction.reply({ content: `⏳ يمكنك تغيير اسمك بعد ${remaining} ساعة.`, ephemeral: true });
      }
      const modal = new ModalBuilder().setCustomId('name_change_modal').setTitle('تغيير الاسم')
        .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('new_name').setLabel('الاسم الجديد').setStyle(TextInputStyle.Short).setRequired(true).setMinLength(2).setMaxLength(32)));
      await interaction.showModal(modal);
    }
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

  if (interaction.isModalSubmit() && interaction.customId === 'name_change_modal') {
    const newName = interaction.fields.getTextInputValue('new_name');
    if (newName.length < 2 || newName.length > 32) return interaction.reply({ content: '⚠️ الاسم يجب أن يكون بين 2 و 32 حرفاً.', ephemeral: true });
    try {
      const oldName = interaction.member.displayName;
      await interaction.member.setNickname(newName);
      db.nameCooldown[interaction.user.id] = Date.now();
      await logToChannel(interaction.guild.id, { title: '✏️ تغيير اسم', color: 0xcc0000, description: `**المستخدم:** ${interaction.user}\n**الاسم القديم:** ${oldName}\n**الاسم الجديد:** ${newName}`, footer: 'تغيير الاسم' });
      await interaction.reply({ content: `✅ تم تغيير اسمك إلى **${newName}**`, ephemeral: true });
    } catch (error) { await interaction.reply({ content: '❌ لا أملك صلاحية تغيير اسمك.', ephemeral: true }); }
  }
});

// ============================================================
// ========== تشغيل البوت ==========
// ============================================================

client.login(TOKEN).catch((err) => {
  console.error('❌ فشل تسجيل الدخول:', err);
  process.exit(1);
});
