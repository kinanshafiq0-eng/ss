// ============================================================
// البوت - ثيم داكن وعملة OG - يدعم الأوتو لاين في عدة رومات
// ============================================================

const {
  Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
  PermissionsBitField, ChannelType, ModalBuilder,
  TextInputBuilder, TextInputStyle, ActivityType
} = require('discord.js');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const express = require('express');
const fs = require('fs');
const app = express();
const port = process.env.PORT || 3000;

// ========== خادم الويب ==========
app.get('/', (req, res) => res.send('✅ البوت يعمل'));
app.listen(port, () => console.log(`🌐 خادم الويب على المنفذ ${port}`));

// ========== متغيرات البيئة ==========
const TOKEN = process.env.DISCORD_TOKEN;
const OWNER_ID = process.env.OWNER_ID || null;
if (!TOKEN) {
  console.error('❌ تأكد من وجود DISCORD_TOKEN في متغيرات البيئة.');
  process.exit(1);
}

// ========== قاعدة البيانات (JSON) ==========
const db = {
  config: {},
  nameCooldown: {},
  memberCount: {},
  ticketSettings: {},
  warns: {},
  autoLine: {},      // الشكل الجديد: { guildId: { channelId: { text, image, enabled } } }
  autoReplies: {},
  users: {},
  levelRoles: {},
  controllers: {},
  economy: {},
};

function saveDB() {
  try {
    fs.writeFileSync('./database.json', JSON.stringify(db, null, 2));
  } catch (e) {
    console.error('❌ فشل حفظ قاعدة البيانات:', e);
  }
}

function loadDB() {
  try {
    const data = fs.readFileSync('./database.json', 'utf8');
    Object.assign(db, JSON.parse(data));
  } catch (e) {
    console.log('📁 لا يوجد ملف database.json، سيتم إنشاؤه تلقائياً.');
    saveDB();
  }
}
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
      suggestionsChannel: null,
      suggestionsTitle: '💡 قناة الاقتراحات',
      suggestionsDescription: 'هل لديك فكرة لتطوير السيرفر؟ شاركنا اقتراحك!',
      suggestionsColor: '#2b2d31',
      suggestionsImage: null,
    };
  }
  return db.config[guildId];
}

function updateGuildConfig(guildId, data) {
  db.config[guildId] = { ...getGuildConfig(guildId), ...data };
  saveDB();
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
  saveDB();
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
  saveDB();
  return db.warns[key].length;
}

function clearWarns(userId, guildId) {
  const key = `${guildId}-${userId}`;
  db.warns[key] = [];
  saveDB();
}

// ========== دوال الأوتو لاين (الدعم الجديد لعدة رومات) ==========
function getAutoLine(guildId) {
  if (!db.autoLine[guildId]) {
    db.autoLine[guildId] = {};
  }
  return db.autoLine[guildId];
}

function getAutoLineChannel(guildId, channelId) {
  const guildAuto = getAutoLine(guildId);
  if (!guildAuto[channelId]) {
    guildAuto[channelId] = { text: null, image: null, enabled: false };
  }
  return guildAuto[channelId];
}

function setAutoLineChannel(guildId, channelId, data) {
  const guildAuto = getAutoLine(guildId);
  guildAuto[channelId] = { ...getAutoLineChannel(guildId, channelId), ...data };
  saveDB();
}

function deleteAutoLineChannel(guildId, channelId) {
  const guildAuto = getAutoLine(guildId);
  delete guildAuto[channelId];
  saveDB();
}

// ========== دوال الردود التلقائية ==========
function getAutoReplies(guildId) {
  if (!db.autoReplies[guildId]) db.autoReplies[guildId] = [];
  return db.autoReplies[guildId];
}

function addAutoReply(guildId, keyword, reply, image = null) {
  const replies = getAutoReplies(guildId);
  const existing = replies.find(r => r.keyword.toLowerCase() === keyword.toLowerCase());
  if (existing) {
    existing.reply = reply;
    existing.image = image;
    saveDB();
    return false;
  }
  replies.push({ keyword, reply, image });
  saveDB();
  return true;
}

function removeAutoReply(guildId, keyword) {
  const replies = getAutoReplies(guildId);
  const index = replies.findIndex(r => r.keyword.toLowerCase() === keyword.toLowerCase());
  if (index === -1) return false;
  replies.splice(index, 1);
  saveDB();
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
  if (!db.users[guildId][userId]) {
    db.users[guildId][userId] = { xp: 0, level: 0, messages: 0 };
  }
  return db.users[guildId][userId];
}

function saveUserData(userId, guildId, data) {
  db.users[guildId][userId] = data;
  saveDB();
}

// ========== دوال الاقتصاد (عملة OG) ==========
function getEconomyData(guildId, userId) {
  if (!db.economy[guildId]) db.economy[guildId] = {};
  if (!db.economy[guildId][userId]) {
    db.economy[guildId][userId] = { og: 0, messageCount: 0, voiceSeconds: 0, lastVoiceJoin: null };
  }
  return db.economy[guildId][userId];
}

function saveEconomyData(guildId, userId, data) {
  db.economy[guildId][userId] = data;
  saveDB();
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
    GatewayIntentBits.GuildMembers,
  ],
});

client.once('ready', () => {
  console.log(`✅ البوت جاهز باسم ${client.user.tag}`);
  if (OWNER_ID) console.log(`👑 صاحب البوت: ${OWNER_ID}`);
  // ===== تم تغيير الحالة =====
  client.user.setActivity('The Kingdom Never Falls.', { type: ActivityType.Watching });
});

// ============================================================
// ========== نظام اللوق ==========
// ============================================================

async function logToChannel(guildId, data) {
  try {
    const config = getGuildConfig(guildId);
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
// ========== نظام الترحيب ==========
// ============================================================

async function generateWelcomeImage(member, memberCount) {
  const canvas = createCanvas(1200, 600);
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, '#1a1a1a');
  gradient.addColorStop(0.5, '#2d2d2d');
  gradient.addColorStop(1, '#1a1a1a');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#666666';
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
  ctx.fillText('مرحباً بك', canvas.width - 50, canvas.height - 40);
  ctx.shadowBlur = 0;
  return canvas.toBuffer('image/png');
}

client.on('guildMemberAdd', async (member) => {
  try {
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
// ========== نظام المستويات والاقتصاد (الرسائل) ==========
// ============================================================

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  if (message.content.startsWith('!')) return;

  const guildId = message.guild.id;
  const userId = message.author.id;

  try {
    // المستويات
    const config = getGuildConfig(guildId);
    if (config.levelChannelId && message.channel.id !== config.levelChannelId) return;

    const userData = getUserData(userId, guildId);
    userData.messages += 1;
    const gain = Math.floor(Math.random() * 15) + 5;
    userData.xp += gain;
    let currentLevel = userData.level;
    let requiredXP = getLevelXP(currentLevel);

    if (userData.xp >= requiredXP) {
      userData.level += 1;
      userData.xp = 0;
      saveUserData(userId, guildId, userData);

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

      const levelRole = db.levelRoles?.[guildId]?.[userData.level];
      if (levelRole) {
        const role = message.guild.roles.cache.get(levelRole);
        if (role) {
          const member = await message.guild.members.fetch(userId).catch(() => null);
          if (member) await member.roles.add(role).catch(() => {});
        }
      }
    } else {
      saveUserData(userId, guildId, userData);
    }

    // الاقتصاد (عملة OG)
    const eco = getEconomyData(guildId, userId);
    eco.messageCount += 1;
    if (eco.messageCount >= 30) {
      eco.messageCount = 0;
      eco.og += 15;
      saveEconomyData(guildId, userId, eco);
      try {
        const member = await message.guild.members.fetch(userId);
        const dmEmbed = new EmbedBuilder()
          .setTitle('💰 مكافأة OG')
          .setDescription(`حصلت على **15 OG** مقابل 30 رسالة في **${message.guild.name}**!\nرصيدك الحالي: **${eco.og} OG**`)
          .setColor(0x2b2d31);
        await member.send({ embeds: [dmEmbed] }).catch(() => {});
      } catch (e) {}
    } else {
      saveEconomyData(guildId, userId, eco);
    }

    // ========== نظام الأوتو لاين (متعدد الرومات) ==========
    // نجلب إعدادات الأوتو لاين لكل القنوات في هذا السيرفر
    const guildAuto = getAutoLine(guildId);
    // نتحقق من القناة الحالية
    const channelAuto = guildAuto[message.channel.id];
    if (channelAuto && channelAuto.enabled && (channelAuto.text || channelAuto.image)) {
      const channel = client.channels.cache.get(message.channel.id);
      if (channel) {
        try {
          if (channelAuto.text && channelAuto.image) {
            const embed = new EmbedBuilder()
              .setDescription(channelAuto.text)
              .setColor(0x2b2d31)
              .setImage(channelAuto.image)
              .setTimestamp();
            await channel.send({ embeds: [embed] });
          } else if (channelAuto.image) {
            const embed = new EmbedBuilder()
              .setColor(0x2b2d31)
              .setImage(channelAuto.image)
              .setTimestamp();
            await channel.send({ embeds: [embed] });
          } else if (channelAuto.text) {
            await channel.send(channelAuto.text);
          }
        } catch (e) {}
        return; // منع الردود التلقائية في نفس الروم
      }
    }

    // الردود التلقائية
    const autoReply = findAutoReply(guildId, message.content);
    if (autoReply) {
      try {
        if (autoReply.image) {
          const embed = new EmbedBuilder()
            .setDescription(autoReply.reply)
            .setColor(0x2b2d31)
            .setImage(autoReply.image)
            .setTimestamp();
          await message.reply({ embeds: [embed] });
        } else {
          await message.reply(autoReply.reply);
        }
      } catch (e) {
        await message.channel.send(autoReply.reply).catch(() => {});
      }
    }

  } catch (error) {
    console.error('❌ خطأ في معالجة الرسالة:', error);
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
      voiceTimeMap.set(`${guildId}-${userId}`, Date.now());
    }

    if (oldState.channelId && !newState.channelId) {
      const key = `${guildId}-${userId}`;
      const joinTime = voiceTimeMap.get(key);
      if (joinTime) {
        const seconds = Math.floor((Date.now() - joinTime) / 1000);
        const minutes = Math.floor(seconds / 60);
        if (minutes >= 1) {
          const eco = getEconomyData(guildId, userId);
          const reward = Math.min(minutes, 30);
          eco.og += reward;
          saveEconomyData(guildId, userId, eco);
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

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;
  if (!message.content.startsWith('!')) return;
  const args = message.content.slice(1).trim().split(/ +/);
  const cmd = args.shift().toLowerCase();
  const guildId = message.guild.id;
  const config = getGuildConfig(guildId);
  const generalImage = getGeneralImage(message.guild, config);

  // حذف الأمر بعد 20 ثانية
  setTimeout(async () => { try { await message.delete(); } catch (e) {} }, 20000);

  try {

    // ========== الاقتصاد (عملة OG) ==========
    if (cmd === 'رصيدي') {
      const eco = getEconomyData(guildId, message.author.id);
      const embed = new EmbedBuilder()
        .setTitle(`💰 رصيد ${message.author.username}`)
        .setDescription(`**${eco.og} OG**`)
        .setColor(0x2b2d31);
      await message.channel.send({ embeds: [embed] });
      return;
    }

    if (cmd === 'توب') {
      const economy = db.economy[guildId];
      if (!economy || Object.keys(economy).length === 0) {
        return message.reply('📭 لا يوجد أي شخص لديه OG حتى الآن.');
      }
      const sorted = Object.entries(economy)
        .sort((a, b) => b[1].og - a[1].og)
        .slice(0, 10);
      let desc = '';
      let rank = 1;
      for (const [id, data] of sorted) {
        const member = message.guild.members.cache.get(id);
        const name = member ? member.user.username : `مستخدم ${id}`;
        desc += `**#${rank}** ${name} - \`${data.og} OG\`\n`;
        rank++;
      }
      const embed = new EmbedBuilder()
        .setTitle('🏆 ترتيب أغنى 10 أشخاص')
        .setDescription(desc)
        .setColor(0x2b2d31)
        .setTimestamp();
      await message.channel.send({ embeds: [embed] });
      return;
    }

    if (cmd === 'اعطاء_عملات' || cmd === 'اعطاء_عمله') {
      if (!hasPermission(message.member, guildId)) {
        return message.reply('❌ تحتاج صلاحية متحكم.');
      }
      const target = message.mentions.members.first();
      const amount = parseInt(args[0]);
      if (!target || !amount || amount <= 0) {
        return message.reply('⚠️ الاستخدام: `!اعطاء_عملات @شخص <المبلغ>`');
      }
      if (target.user.bot) return message.reply('❌ لا يمكن إعطاء البوتات.');
      const eco = getEconomyData(guildId, target.id);
      eco.og += amount;
      saveEconomyData(guildId, target.id, eco);
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
      if (!hasPermission(message.member, guildId)) {
        return message.reply('❌ تحتاج صلاحية متحكم.');
      }
      const target = message.mentions.members.first();
      const amount = parseInt(args[0]);
      if (!target || !amount || amount <= 0) {
        return message.reply('⚠️ الاستخدام: `!سحب_عملات @شخص <المبلغ>`');
      }
      if (target.user.bot) return message.reply('❌ لا يمكن السحب من البوتات.');
      const eco = getEconomyData(guildId, target.id);
      if (eco.og < amount) {
        return message.reply(`⚠️ رصيده غير كافٍ. لديه **${eco.og} OG** فقط.`);
      }
      eco.og -= amount;
      saveEconomyData(guildId, target.id, eco);
      const embed = new EmbedBuilder()
        .setTitle('✅ تم سحب العملات')
        .setDescription(`تم سحب **${amount} OG** من <@${target.id}>.\nرصيده الآن: **${eco.og} OG**`)
        .setColor(0x2b2d31);
      await message.channel.send({ embeds: [embed] });
      return;
    }

    // ========== المساعدة ==========
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
          { name: '👋 الترحيب', value: '`تعيين ترحيب #قناة` `تعيين رسالة_ترحيب نص` `تعيين صورة_ترحيب رابط` `تعيين عنوان_ترحيب نص`', inline: false },
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
      if (!isOwner(message.author.id)) return message.reply('❌ هذا الأمر للمالك فقط.');
      const member = message.mentions.members.first();
      if (!member) return message.reply('⚠️ منشن العضو.');
      if (member.id === client.user.id) return message.reply('❌ لا يمكنني جعل نفسي متحكماً.');
      if (isOwner(member.id)) return message.reply('❌ هذا هو مالك البوت، يملك صلاحية مطلقة مسبقاً.');
      if (isController(member.id, guildId)) return message.reply(`⚠️ ${member} متحكم بالفعل.`);
      if (!db.controllers[guildId]) db.controllers[guildId] = [];
      db.controllers[guildId].push(member.id);
      saveDB();
      await logToChannel(guildId, { title: '🛡️ تعيين متحكم', color: 0x2b2d31, description: `**${message.author}** جعل ${member} متحكماً.` });
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
      await logToChannel(guildId, { title: '🛡️ إلغاء متحكم', color: 0x2b2d31, description: `**${message.author}** ألغى صلاحية ${member}.` });
      await message.reply(`✅ تم إلغاء صلاحية التحكم عن ${member}.`);
      return;
    }

    if (cmd === 'قائمة_المتحكمين') {
      const controllers = db.controllers[guildId] || [];
      if (!controllers.length) return message.reply('📋 لا يوجد متحكمون في هذا السيرفر.');
      const list = controllers.map(id => `<@${id}>`).join('\n');
      const embed = new EmbedBuilder().setTitle('🛡️ قائمة المتحكمين').setColor(0x2b2d31).setDescription(list).setTimestamp();
      if (generalImage) embed.setImage(generalImage);
      await message.channel.send({ embeds: [embed] });
      return;
    }

    // ========== أمر "تعيين" ==========
    if (cmd === 'تعيين') {
      if (!hasPermission(message.member, guildId)) return message.reply('❌ تحتاج صلاحية متحكم.');

      const sub = args[0]?.toLowerCase();
      const value = args.slice(1).join(' ');

      if (!sub) {
        const embed = new EmbedBuilder()
          .setTitle('⚙️ أوامر الإعدادات')
          .setColor(0x2b2d31)
          .addFields(
            { name: '👋 الترحيب', value: '`ترحيب #قناة`، `رسالة_ترحيب نص`، `صورة_ترحيب رابط`، `عنوان_ترحيب نص`' },
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
        return message.channel.send({ embeds: [embed] });
      }

      // الترحيب
      if (sub === 'ترحيب') {
        const channel = message.mentions.channels.first();
        if (!channel) {
          updateGuildConfig(guildId, { welcomeChannel: null });
          await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0x2b2d31, description: `**${message.author}** ألغى قناة الترحيب.` });
          return message.reply('✅ تم إلغاء تحديد قناة الترحيب.');
        }
        updateGuildConfig(guildId, { welcomeChannel: channel.id });
        await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0x2b2d31, description: `**${message.author}** عيّن قناة الترحيب إلى ${channel}.` });
        return message.reply(`✅ تم تعيين قناة الترحيب إلى ${channel}`);
      }

      if (sub === 'رسالة_ترحيب') {
        if (!value) return message.reply('⚠️ أدخل نص الترحيب الجديد.');
        updateGuildConfig(guildId, { welcomeMessage: value });
        await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0x2b2d31, description: `**${message.author}** غيّر نص الترحيب إلى:\n${value}` });
        return message.reply(`✅ تم تعيين نص الترحيب:\n${value}`);
      }

      if (sub === 'صورة_ترحيب') {
        if (!value) {
          updateGuildConfig(guildId, { welcomeImage: null });
          await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0x2b2d31, description: `**${message.author}** ألغى صورة الترحيب.` });
          return message.reply('✅ تم إلغاء صورة الترحيب.');
        }
        updateGuildConfig(guildId, { welcomeImage: value });
        await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0x2b2d31, description: `**${message.author}** عيّن صورة الترحيب: ${value}` });
        return message.reply(`✅ تم تعيين صورة الترحيب: ${value}`);
      }

      if (sub === 'عنوان_ترحيب') {
        if (!value) return message.reply('⚠️ أدخل العنوان الجديد.');
        updateGuildConfig(guildId, { welcomeTitle: value });
        await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0x2b2d31, description: `**${message.author}** غيّر عنوان الترحيب إلى: "${value}"` });
        return message.reply(`✅ تم تعيين عنوان الترحيب: "${value}"`);
      }

      // اللوق
      if (sub === 'سجلات') {
        const channel = message.mentions.channels.first();
        if (!channel) {
          updateGuildConfig(guildId, { logChannel: null });
          return message.reply('✅ تم إلغاء تعيين قناة اللوق.');
        }
        updateGuildConfig(guildId, { logChannel: channel.id });
        await logToChannel(guildId, { title: '📋 تم تعيين قناة اللوق', color: 0x2b2d31, description: `**${message.author}** عيّن قناة اللوق إلى ${channel}` });
        return message.reply(`✅ تم تعيين قناة اللوق إلى ${channel}`);
      }

      // روم الليفل
      if (sub === 'روم_ليفل') {
        const channel = message.mentions.channels.first();
        if (!channel) {
          updateGuildConfig(guildId, { levelChannelId: null });
          await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0x2b2d31, description: `**${message.author}** ألغى قناة الليفل.` });
          return message.reply('✅ تم إلغاء تحديد قناة الليفل.');
        }
        updateGuildConfig(guildId, { levelChannelId: channel.id });
        await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0x2b2d31, description: `**${message.author}** عيّن قناة الليفل إلى ${channel}.` });
        return message.reply(`✅ تم تعيين قناة الليفل إلى ${channel}`);
      }

      // ========== الأوتو لاين (بالصيغة الجديدة – متعدد الرومات) ==========
      if (sub === 'اوتر_لاين') {
        const channel = message.mentions.channels.first();
        if (!channel) return message.reply('⚠️ منشن الروم.');
        const text = args.slice(2).join(' ');
        setAutoLineChannel(guildId, channel.id, { text: text || null, enabled: true });
        await logToChannel(guildId, { title: '🤖 تعيين أوتو لاين', color: 0x2b2d31, description: `**${message.author}** عيّن الأوتو لاين في ${channel}${text ? `:\n${text}` : ''}` });
        const embed = new EmbedBuilder()
          .setTitle('✅ تم تعيين الأوتو لاين')
          .setColor(0x2b2d31)
          .setDescription(`**الروم:** ${channel}${text ? `\n**النص:** ${text}` : ''}`)
          .setFooter({ text: 'تم التفعيل تلقائياً لهذا الروم.' });
        if (generalImage) embed.setImage(generalImage);
        await message.channel.send({ embeds: [embed] });
        return;
      }

      if (sub === 'صورة_اوترلاين') {
        const channel = message.mentions.channels.first();
        if (!channel) return message.reply('⚠️ منشن الروم.');
        const imageUrl = args.slice(2).join(' ');
        if (!imageUrl) {
          setAutoLineChannel(guildId, channel.id, { image: null });
          await logToChannel(guildId, { title: '🖼️ إزالة صورة أوتو لاين', color: 0x2b2d31, description: `**${message.author}** أزال صورة الأوتو لاين في ${channel}` });
          return message.reply(`✅ تم إزالة صورة الأوتو لاين من ${channel}`);
        }
        setAutoLineChannel(guildId, channel.id, { image: imageUrl });
        await logToChannel(guildId, { title: '🖼️ تعيين صورة أوتو لاين', color: 0x2b2d31, description: `**${message.author}** عيّن صورة الأوتو لاين في ${channel}: ${imageUrl}` });
        const embed = new EmbedBuilder()
          .setTitle('✅ تم تعيين صورة الأوتو لاين')
          .setColor(0x2b2d31)
          .setDescription(`**الروم:** ${channel}\n[رابط الصورة](${imageUrl})`)
          .setImage(imageUrl);
        if (generalImage) embed.setThumbnail(generalImage);
        await message.channel.send({ embeds: [embed] });
        return;
      }

      if (sub === 'تفعيل_اوترلاين') {
        const channel = message.mentions.channels.first();
        if (!channel) return message.reply('⚠️ منشن الروم.');
        const auto = getAutoLineChannel(guildId, channel.id);
        if (!auto.text && !auto.image) {
          return message.reply(`⚠️ لم يتم تعيين نص أو صورة لهذا الروم. استخدم \`!تعيين اوتر_لاين ${channel} [نص]\` أولاً.`);
        }
        setAutoLineChannel(guildId, channel.id, { enabled: true });
        await logToChannel(guildId, { title: '✅ تفعيل أوتو لاين', color: 0x2b2d31, description: `**${message.author}** فعّل الأوتو لاين في ${channel}.` });
        const embed = new EmbedBuilder()
          .setTitle('✅ تم تفعيل الأوتو لاين')
          .setColor(0x2b2d31)
          .setDescription(`تم تشغيل النظام في ${channel}. سيرد البوت تلقائياً بعد كل رسالة.`);
        if (generalImage) embed.setImage(generalImage);
        await message.channel.send({ embeds: [embed] });
        return;
      }

      if (sub === 'تعطيل_اوترلاين') {
        const channel = message.mentions.channels.first();
        if (!channel) return message.reply('⚠️ منشن الروم.');
        setAutoLineChannel(guildId, channel.id, { enabled: false });
        await logToChannel(guildId, { title: '⏹️ تعطيل أوتو لاين', color: 0x2b2d31, description: `**${message.author}** عطّل الأوتو لاين في ${channel}.` });
        const embed = new EmbedBuilder()
          .setTitle('⏹️ تم تعطيل الأوتو لاين')
          .setColor(0x2b2d31)
          .setDescription(`تم إيقاف النظام في ${channel}. لن يرد البوت تلقائياً حتى يتم تفعيله مرة أخرى.`);
        if (generalImage) embed.setImage(generalImage);
        await message.channel.send({ embeds: [embed] });
        return;
      }

      if (sub === 'حذف_اوترلاين' || sub === 'حذف_اوتر_لاين') {
        const channel = message.mentions.channels.first();
        if (!channel) return message.reply('⚠️ منشن الروم.');
        deleteAutoLineChannel(guildId, channel.id);
        await logToChannel(guildId, { title: '🗑️ حذف أوتو لاين', color: 0x2b2d31, description: `**${message.author}** حذف إعدادات الأوتو لاين في ${channel}.` });
        const embed = new EmbedBuilder()
          .setTitle('🗑️ تم حذف الأوتو لاين')
          .setColor(0x2b2d31)
          .setDescription(`تم حذف جميع إعدادات الأوتو لاين من ${channel}.`);
        if (generalImage) embed.setImage(generalImage);
        await message.channel.send({ embeds: [embed] });
        return;
      }

      // دور دخول
      if (sub === 'دور_دخول') {
        const role = message.mentions.roles.first();
        if (!role) return message.reply('⚠️ منشن الدور.');
        updateGuildConfig(guildId, { joinRole: role.id });
        await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0x2b2d31, description: `**${message.author}** عيّن دور الدخول إلى ${role.name}.` });
        return message.reply(`✅ تم تعيين دور الدخول إلى ${role}`);
      }

      // صورة بانل
      if (sub === 'صورة_بانل') {
        if (!value) return message.reply('⚠️ أدخل رابط الصورة.');
        updateGuildConfig(guildId, { ticketPanelImage: value });
        await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0x2b2d31, description: `**${message.author}** عيّن صورة البانل: ${value}` });
        return message.reply(`✅ تم تعيين صورة البانل: ${value}`);
      }

      // صورة رتب
      if (sub === 'صورة_رتب') {
        if (!value) return message.reply('⚠️ أدخل رابط الصورة.');
        updateGuildConfig(guildId, { rolesImage: value });
        await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0x2b2d31, description: `**${message.author}** عيّن صورة رتب الإشعارات: ${value}` });
        return message.reply(`✅ تم تعيين صورة رتب الإشعارات: ${value}`);
      }

      // صورة بنر
      if (sub === 'صورة_بنر') {
        if (!value) return message.reply('⚠️ أدخل رابط الصورة.');
        updateGuildConfig(guildId, { bannerImage: value });
        await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0x2b2d31, description: `**${message.author}** عيّن صورة البنر: ${value}` });
        return message.reply(`✅ تم تعيين صورة البنر: ${value}`);
      }

      // صورة عامة
      if (sub === 'صورة_عامة') {
        if (!value) return message.reply('⚠️ أدخل رابط الصورة.');
        updateGuildConfig(guildId, { generalImage: value });
        await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0x2b2d31, description: `**${message.author}** عيّن الصورة العامة: ${value}` });
        return message.reply(`✅ تم تعيين الصورة العامة: ${value}`);
      }

      // الاقتراحات
      if (sub === 'قناة_اقتراح') {
        const channel = message.mentions.channels.first();
        if (!channel) return message.reply('⚠️ منشن القناة.');
        updateGuildConfig(guildId, { suggestionsChannel: channel.id });
        await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0x2b2d31, description: `**${message.author}** عيّن قناة الاقتراحات إلى ${channel}` });
        return message.reply(`✅ تم تعيين قناة الاقتراحات إلى ${channel}`);
      }

      if (sub === 'عنوان_اقتراح') {
        if (!value) return message.reply('⚠️ أدخل العنوان.');
        updateGuildConfig(guildId, { suggestionsTitle: value });
        await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0x2b2d31, description: `**${message.author}** غيّر عنوان الاقتراحات إلى: "${value}"` });
        return message.reply(`✅ تم تعيين عنوان الاقتراحات: "${value}"`);
      }

      if (sub === 'وصف_اقتراح') {
        if (!value) return message.reply('⚠️ أدخل الوصف.');
        updateGuildConfig(guildId, { suggestionsDescription: value });
        await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0x2b2d31, description: `**${message.author}** غيّر وصف الاقتراحات إلى:\n${value}` });
        return message.reply(`✅ تم تعيين وصف الاقتراحات:\n${value}`);
      }

      if (sub === 'لون_اقتراح') {
        if (!value || !value.match(/^#[0-9a-fA-F]{6}$/)) return message.reply('⚠️ أدخل لوناً صحيحاً بصيغة Hex مثل `#2b2d31`.');
        updateGuildConfig(guildId, { suggestionsColor: value });
        await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0x2b2d31, description: `**${message.author}** عيّن لون الاقتراحات إلى ${value}` });
        return message.reply(`✅ تم تعيين لون الاقتراحات: ${value}`);
      }

      if (sub === 'صورة_اقتراح') {
        if (!value) return message.reply('⚠️ أدخل رابط الصورة.');
        updateGuildConfig(guildId, { suggestionsImage: value });
        await logToChannel(guildId, { title: '⚙️ إعدادات', color: 0x2b2d31, description: `**${message.author}** عيّن صورة الاقتراحات: ${value}` });
        return message.reply(`✅ تم تعيين صورة الاقتراحات: ${value}`);
      }

      // التذاكر (إدارة الأقسام)
      if (sub === 'تذكرة') {
        const settings = getTicketSettings(guildId);
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
          saveTicketSettings(guildId, settings);
          await logToChannel(guildId, { title: '🎫 إضافة قسم تذكرة', color: 0x2b2d31, description: `**${message.author}** أضاف قسم **${sectionName}** مع دور <@&${roleId}> وإيموجي ${emoji}` });
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
          saveTicketSettings(guildId, settings);
          await logToChannel(guildId, { title: '🎨 تعيين إيموجي قسم', color: 0x2b2d31, description: `**${message.author}** عيّن الإيموجي ${emoji} لقسم **${sectionName}**` });
          return message.reply(`✅ تم تعيين الإيموجي ${emoji} لقسم **${sectionName}**.`);
        }

        if (action === 'حذف') {
          const sectionName = actionValue.trim();
          const index = settings.sections.findIndex(s => s.name === sectionName);
          if (index === -1) return message.reply(`⚠️ قسم "${sectionName}" غير موجود.`);

          settings.sections.splice(index, 1);
          saveTicketSettings(guildId, settings);
          await logToChannel(guildId, { title: '🗑️ حذف قسم تذكرة', color: 0x2b2d31, description: `**${message.author}** حذف قسم **${sectionName}**` });
          return message.reply(`✅ تم حذف قسم **${sectionName}**.`);
        }

        if (action === 'نص') {
          if (!actionValue) return message.reply('⚠️ أدخل النص الجديد.');
          settings.text = actionValue;
          saveTicketSettings(guildId, settings);
          await logToChannel(guildId, { title: '📝 تغيير نص التذاكر', color: 0x2b2d31, description: `**${message.author}** غيّر نص التذاكر.` });
          return message.reply(`✅ تم تغيير نص التذاكر:\n${actionValue}`);
        }

        if (action === 'صورة') {
          if (!actionValue) return message.reply('⚠️ أدخل رابط الصورة.');
          settings.image = actionValue;
          saveTicketSettings(guildId, settings);
          await logToChannel(guildId, { title: '🖼️ تغيير صورة التذاكر', color: 0x2b2d31, description: `**${message.author}** غيّر صورة التذاكر.` });
          return message.reply(`✅ تم تغيير صورة التذاكر: ${actionValue}`);
        }

        return message.reply('⚠️ أمر غير معروف. استخدم `!تعيين تذكرة` لعرض التعليمات.');
      }

      return message.reply('⚠️ خيار غير معروف. استخدم `!تعيين` لعرض القائمة.');
    }

    // ========== بانل الاقتراحات ==========
    if (cmd === 'بانل_اقتراح') {
      if (!hasPermission(message.member, guildId)) return message.reply('❌ تحتاج صلاحية متحكم.');

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
      return message.reply('✅ تم إنشاء لوحة الاقتراحات.');
    }

    // ========== اختبار اللوق ==========
    if (cmd === 'اختبار_لوق') {
      if (!hasPermission(message.member, guildId)) return message.reply('❌ تحتاج صلاحية متحكم.');
      if (!config.logChannel) return message.reply('⚠️ لم يتم تعيين قناة اللوق.');
      const channel = message.guild.channels.cache.get(config.logChannel);
      if (!channel) return message.reply('❌ قناة اللوق غير موجودة.');
      await logToChannel(guildId, {
        title: '🧪 اختبار اللوق',
        color: 0x2b2d31,
        description: `✅ اللوق يعمل بنجاح!\n**المنفذ:** ${message.author}`,
        footer: 'رسالة اختبار',
      });
      return message.reply('✅ تم إرسال رسالة اختبار إلى قناة اللوق.');
    }

    // ========== مستوى ==========
    if (cmd === 'مستوى') {
      const member = message.mentions.members.first() || message.member;
      const userData = getUserData(member.id, guildId);
      const embed = new EmbedBuilder()
        .setTitle(`📊 مستوى ${member.user.username}`)
        .setColor(0x2b2d31)
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
      const embed = new EmbedBuilder().setTitle('🏆 ترتيب المستويات').setColor(0x2b2d31).setDescription(desc).setFooter({ text: 'أعلى 10 أعضاء' });
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
      const embed = new EmbedBuilder().setTitle(title).setDescription(description).setColor(0x2b2d31).setTimestamp();
      const imageMatch = description.match(/(https?:\/\/[^\s]+\.(?:png|jpg|jpeg|gif|webp))/i);
      if (imageMatch) { embed.setImage(imageMatch[1]); embed.setDescription(description.replace(imageMatch[1], '').trim() || 'بدون وصف'); }
      if (generalImage) embed.setThumbnail(generalImage);
      await message.channel.send({ embeds: [embed] });
      return;
    }

    // ========== اعلان ==========
    if (cmd === 'اعلان') {
      if (!hasPermission(message.member, guildId)) return message.reply('❌ تحتاج صلاحية متحكم.');
      let mentionType = 'everyone';
      let text = args.join(' ');
      if (args[0]?.toLowerCase() === 'here') { mentionType = 'here'; text = args.slice(1).join(' '); }
      if (!text) return message.reply('⚠️ اكتب نص الإعلان.');
      const embed = new EmbedBuilder().setTitle('📢 إعلان').setDescription(text).setColor(0x2b2d31).setTimestamp().setFooter({ text: `بواسطة ${message.author.tag}` });
      if (generalImage) embed.setImage(generalImage);
      await message.channel.send({ content: mentionType === 'everyone' ? '@everyone' : '@here', embeds: [embed] });
      return;
    }

    // ========== الإدارة ==========
    if (cmd === 'حظر') {
      if (!hasPermission(message.member, guildId)) return message.reply('❌ تحتاج صلاحية متحكم.');
      const member = message.mentions.members.first();
      if (!member) return message.reply('⚠️ منشن العضو.');
      const reason = args.join(' ') || 'لا يوجد سبب';
      await member.ban({ reason });
      const embed = new EmbedBuilder().setTitle('✅ تم الحظر').setColor(0x2b2d31).setDescription(`${member.user.tag} تم حظره بسبب: ${reason}`);
      if (generalImage) embed.setImage(generalImage);
      await message.channel.send({ embeds: [embed] });
      await logToChannel(guildId, { title: '🔨 حظر', color: 0x2b2d31, description: `**المنفذ:** ${message.author}\n**المستهدف:** ${member.user.tag}\n**السبب:** ${reason}` });
      return;
    }

    if (cmd === 'طرد') {
      if (!hasPermission(message.member, guildId)) return message.reply('❌ تحتاج صلاحية متحكم.');
      const member = message.mentions.members.first();
      if (!member) return message.reply('⚠️ منشن العضو.');
      const reason = args.join(' ') || 'لا يوجد سبب';
      await member.kick(reason);
      const embed = new EmbedBuilder().setTitle('✅ تم الطرد').setColor(0x2b2d31).setDescription(`${member.user.tag} تم طرده بسبب: ${reason}`);
      if (generalImage) embed.setImage(generalImage);
      await message.channel.send({ embeds: [embed] });
      await logToChannel(guildId, { title: '🚪 طرد', color: 0x2b2d31, description: `**المنفذ:** ${message.author}\n**المستهدف:** ${member.user.tag}\n**السبب:** ${reason}` });
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
      const embed = new EmbedBuilder().setTitle('🔇 تم الكتم').setColor(0x2b2d31).setDescription(`${member.user.tag} تم كتمه بسبب: ${reason}`);
      if (generalImage) embed.setImage(generalImage);
      await message.channel.send({ embeds: [embed] });
      await logToChannel(guildId, { title: '🔇 كتم', color: 0x2b2d31, description: `**المنفذ:** ${message.author}\n**المستهدف:** ${member.user.tag}\n**السبب:** ${reason}` });
      return;
    }

    if (cmd === 'فك_كتم') {
      if (!hasPermission(message.member, guildId)) return message.reply('❌ تحتاج صلاحية متحكم.');
      const member = message.mentions.members.first();
      if (!member) return message.reply('⚠️ منشن العضو.');
      const muteRole = message.guild.roles.cache.find(r => r.name === 'Muted');
      if (!muteRole) return message.reply('⚠️ لا يوجد دور Muted في السيرفر.');
      await member.roles.remove(muteRole);
      const embed = new EmbedBuilder().setTitle('🔊 تم فك الكتم').setColor(0x2b2d31).setDescription(`${member.user.tag} تم فك الكتم عنه.`);
      if (generalImage) embed.setImage(generalImage);
      await message.channel.send({ embeds: [embed] });
      await logToChannel(guildId, { title: '🔊 فك كتم', color: 0x2b2d31, description: `**المنفذ:** ${message.author}\n**المستهدف:** ${member.user.tag}` });
      return;
    }

    if (cmd === 'تحذير') {
      if (!hasPermission(message.member, guildId)) return message.reply('❌ تحتاج صلاحية متحكم.');
      const member = message.mentions.members.first();
      if (!member) return message.reply('⚠️ منشن العضو.');
      const reason = args.join(' ') || 'لا يوجد سبب';
      const count = addWarn(member.id, guildId, reason, message.author.id);
      const embed = new EmbedBuilder().setTitle('⚠️ تحذير').setColor(0x2b2d31).setDescription(`${member.user.tag} تم تحذيره بسبب: ${reason}\nإجمالي التحذيرات: ${count}`);
      if (generalImage) embed.setImage(generalImage);
      await message.channel.send({ embeds: [embed] });
      await logToChannel(guildId, { title: '⚠️ تحذير', color: 0x2b2d31, description: `**المنفذ:** ${message.author}\n**المستهدف:** ${member.user.tag}\n**السبب:** ${reason}\n**عدد التحذيرات:** ${count}` });
      try {
        const dmEmbed = new EmbedBuilder().setTitle('⚠️ تم تحذيرك').setColor(0x2b2d31)
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
      const embed = new EmbedBuilder().setTitle('✅ تم إبطال التحذيرات').setColor(0x2b2d31).setDescription(`تم إلغاء كل تحذيرات ${member.user.tag}.`);
      if (generalImage) embed.setImage(generalImage);
      await message.channel.send({ embeds: [embed] });
      await logToChannel(guildId, { title: '✅ إبطال تحذيرات', color: 0x2b2d31, description: `**المنفذ:** ${message.author}\n**المستهدف:** ${member.user.tag}` });
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
      await logToChannel(guildId, { title: '🗑️ مسح رسائل', color: 0x2b2d31, description: `**المنفذ:** ${message.author}\n**القناة:** ${message.channel.name}\n**عدد الرسائل:** ${count}` });
      return;
    }

    if (cmd === 'قفل') {
      if (!hasPermission(message.member, guildId)) return message.reply('❌ تحتاج صلاحية متحكم.');
      await message.channel.permissionOverwrites.create(message.guild.id, { SendMessages: false });
      const embed = new EmbedBuilder().setTitle('🔒 تم قفل القناة').setColor(0x2b2d31).setDescription(`تم قفل ${message.channel}`);
      if (generalImage) embed.setImage(generalImage);
      await message.channel.send({ embeds: [embed] });
      await logToChannel(guildId, { title: '🔒 قفل قناة', color: 0x2b2d31, description: `**المنفذ:** ${message.author}\n**القناة:** ${message.channel.name}` });
      return;
    }

    if (cmd === 'فتح') {
      if (!hasPermission(message.member, guildId)) return message.reply('❌ تحتاج صلاحية متحكم.');
      await message.channel.permissionOverwrites.delete(message.guild.id);
      const embed = new EmbedBuilder().setTitle('🔓 تم فتح القناة').setColor(0x2b2d31).setDescription(`تم فتح ${message.channel}`);
      if (generalImage) embed.setImage(generalImage);
      await message.channel.send({ embeds: [embed] });
      await logToChannel(guildId, { title: '🔓 فتح قناة', color: 0x2b2d31, description: `**المنفذ:** ${message.author}\n**القناة:** ${message.channel.name}` });
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
      const embed = new EmbedBuilder().setTitle('✅ تم إعطاء الرتبة').setColor(0x2b2d31).setDescription(`تم إعطاء ${member} رتبة ${role}`);
      if (generalImage) embed.setImage(generalImage);
      await message.channel.send({ embeds: [embed] });
      await logToChannel(guildId, { title: '🎭 إعطاء رتبة', color: 0x2b2d31, description: `**المنفذ:** ${message.author}\n**المستهدف:** ${member.user.tag}\n**الرتبة:** ${role.name}` });
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
      const embed = new EmbedBuilder().setTitle('✅ تم سحب الرتبة').setColor(0x2b2d31).setDescription(`تم سحب رتبة ${role} من ${member}`);
      if (generalImage) embed.setImage(generalImage);
      await message.channel.send({ embeds: [embed] });
      await logToChannel(guildId, { title: '🎭 سحب رتبة', color: 0x2b2d31, description: `**المنفذ:** ${message.author}\n**المستهدف:** ${member.user.tag}\n**الرتبة:** ${role.name}` });
      return;
    }

    if (cmd === 'عرض_رتب') {
      const member = message.mentions.members.first() || message.member;
      const roles = member.roles.cache.filter(r => r.id !== message.guild.id).map(r => r.toString()).join(' ') || 'لا يوجد رتب';
      const embed = new EmbedBuilder().setTitle(`🎭 رتب ${member.user.username}`).setColor(0x2b2d31).setDescription(roles);
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
      const embed = new EmbedBuilder().setTitle('✅ تم إنشاء القناة').setColor(0x2b2d31).setDescription(`تم إنشاء ${channel}`);
      if (generalImage) embed.setImage(generalImage);
      await message.channel.send({ embeds: [embed] });
      await logToChannel(guildId, { title: '📁 إنشاء قناة', color: 0x2b2d31, description: `**المنفذ:** ${message.author}\n**القناة:** ${channel.name}` });
      return;
    }

    if (cmd === 'حذف_قناة') {
      if (!hasPermission(message.member, guildId)) return message.reply('❌ تحتاج صلاحية متحكم.');
      const channel = message.mentions.channels.first();
      if (!channel) return message.reply('⚠️ منشن القناة.');
      const channelName = channel.name;
      await channel.delete();
      const embed = new EmbedBuilder().setTitle('🗑️ تم حذف القناة').setColor(0x2b2d31).setDescription(`تم حذف ${channelName}`);
      if (generalImage) embed.setImage(generalImage);
      await message.channel.send({ embeds: [embed] });
      await logToChannel(guildId, { title: '🗑️ حذف قناة', color: 0x2b2d31, description: `**المنفذ:** ${message.author}\n**القناة:** ${channelName}` });
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
      const embed = new EmbedBuilder().setTitle('✏️ تم تغيير اسم القناة').setColor(0x2b2d31).setDescription(`تم تغيير اسم القناة إلى ${newName}`);
      if (generalImage) embed.setImage(generalImage);
      await message.channel.send({ embeds: [embed] });
      await logToChannel(guildId, { title: '✏️ تغيير اسم قناة', color: 0x2b2d31, description: `**المنفذ:** ${message.author}\n**الاسم القديم:** ${oldName}\n**الاسم الجديد:** ${newName}` });
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
        const embed = new EmbedBuilder().setTitle('📌 تم تثبيت الرسالة').setColor(0x2b2d31).setDescription(`[رابط الرسالة](${msg.url})`);
        if (generalImage) embed.setImage(generalImage);
        await message.channel.send({ embeds: [embed] });
        await logToChannel(guildId, { title: '📌 تثبيت رسالة', color: 0x2b2d31, description: `**المنفذ:** ${message.author}\n**القناة:** ${message.channel.name}\n[رابط الرسالة](${msg.url})` });
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
        const embed = new EmbedBuilder().setTitle('📌 تم إلغاء تثبيت الرسالة').setColor(0x2b2d31).setDescription(`[رابط الرسالة](${msg.url})`);
        if (generalImage) embed.setImage(generalImage);
        await message.channel.send({ embeds: [embed] });
        await logToChannel(guildId, { title: '📌 إلغاء تثبيت رسالة', color: 0x2b2d31, description: `**المنفذ:** ${message.author}\n**القناة:** ${message.channel.name}\n[رابط الرسالة](${msg.url})` });
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
      const embed = new EmbedBuilder().setTitle('🔊 تم نقل الأعضاء').setColor(0x2b2d31).setDescription(`تم نقل ${count} عضو من ${from} إلى ${to}`);
      if (generalImage) embed.setImage(generalImage);
      await message.channel.send({ embeds: [embed] });
      await logToChannel(guildId, { title: '🔊 نقل أعضاء صوتي', color: 0x2b2d31, description: `**المنفذ:** ${message.author}\n**من:** ${from.name}\n**إلى:** ${to.name}\n**عدد الأعضاء:** ${count}` });
      return;
    }

    if (cmd === 'طرد_صوتي') {
      if (!hasPermission(message.member, guildId)) return message.reply('❌ تحتاج صلاحية متحكم.');
      const member = message.mentions.members.first();
      if (!member) return message.reply('⚠️ منشن العضو.');
      if (!member.voice.channel) return message.reply('⚠️ هذا العضو ليس في روم صوتي.');
      await member.voice.disconnect();
      const embed = new EmbedBuilder().setTitle('🔊 تم طرد العضو من الصوت').setColor(0x2b2d31).setDescription(`تم طرد ${member.user.tag} من الروم الصوتي.`);
      if (generalImage) embed.setImage(generalImage);
      await message.channel.send({ embeds: [embed] });
      await logToChannel(guildId, { title: '🔊 طرد من الصوت', color: 0x2b2d31, description: `**المنفذ:** ${message.author}\n**المستهدف:** ${member.user.tag}` });
      return;
    }

    if (cmd === 'كتم_صوتي') {
      if (!hasPermission(message.member, guildId)) return message.reply('❌ تحتاج صلاحية متحكم.');
      const member = message.mentions.members.first();
      if (!member) return message.reply('⚠️ منشن العضو.');
      if (!member.voice.channel) return message.reply('⚠️ هذا العضو ليس في روم صوتي.');
      await member.voice.setMute(true);
      const embed = new EmbedBuilder().setTitle('🔇 تم الكتم الصوتي').setColor(0x2b2d31).setDescription(`تم كتم صوت ${member.user.tag} في الروم الصوتي.`);
      if (generalImage) embed.setImage(generalImage);
      await message.channel.send({ embeds: [embed] });
      await logToChannel(guildId, { title: '🔇 كتم صوتي', color: 0x2b2d31, description: `**المنفذ:** ${message.author}\n**المستهدف:** ${member.user.tag}` });
      return;
    }

    if (cmd === 'فك_كتم_صوتي') {
      if (!hasPermission(message.member, guildId)) return message.reply('❌ تحتاج صلاحية متحكم.');
      const member = message.mentions.members.first();
      if (!member) return message.reply('⚠️ منشن العضو.');
      if (!member.voice.channel) return message.reply('⚠️ هذا العضو ليس في روم صوتي.');
      await member.voice.setMute(false);
      const embed = new EmbedBuilder().setTitle('🔊 تم فك الكتم الصوتي').setColor(0x2b2d31).setDescription(`تم فك كتم صوت ${member.user.tag} في الروم الصوتي.`);
      if (generalImage) embed.setImage(generalImage);
      await message.channel.send({ embeds: [embed] });
      await logToChannel(guildId, { title: '🔊 فك كتم صوتي', color: 0x2b2d31, description: `**المنفذ:** ${message.author}\n**المستهدف:** ${member.user.tag}` });
      return;
    }

    // ========== معلومات ==========
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
      await message.channel.send({ embeds: [embed] });
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
      await message.channel.send({ embeds: [embed] });
      return;
    }

    if (cmd === 'بينق') {
      const embed = new EmbedBuilder().setColor(0x2b2d31).setDescription(`🏓 البينق: ${client.ws.ping}ms`);
      if (generalImage) embed.setImage(generalImage);
      await message.channel.send({ embeds: [embed] });
      return;
    }

    // ========== عرض التذاكر ==========
    if (cmd === 'عرض_تذكرة') {
      const settings = getTicketSettings(guildId);
      const embed = new EmbedBuilder().setTitle('📋 إعدادات التذاكر').setColor(0x2b2d31)
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
      if (!hasPermission(message.member, guildId)) return message.reply('❌ تحتاج صلاحية متحكم.');
      const settings = getTicketSettings(guildId);
      const imageUrl = settings.image || 'https://i.imgur.com/GkKqN3G.png';
      const embed = new EmbedBuilder().setTitle('🎫 تذاكر دعم فني').setDescription(settings.text).setColor(0x2b2d31).setImage(imageUrl).setFooter({ text: 'سيتم إنشاء قناة خاصة بك وسيرد عليك الفريق.' });
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
      await logToChannel(guildId, { title: '🎫 إنشاء لوحة تذاكر', color: 0x2b2d31, description: `**${message.author}** أنشأ لوحة تذاكر.` });
      return message.reply('✅ تم إنشاء لوحة التذاكر.');
    }

    // ========== رتب الإشعارات ==========
    if (cmd === 'رتب') {
      if (!hasPermission(message.member, guildId)) return message.reply('❌ تحتاج صلاحية متحكم.');
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
      return message.reply('✅ تم إنشاء لوحة الرتب.');
    }

    // ========== تغيير الاسم ==========
    if (cmd === 'تغيير_اسم') {
      const userId = message.author.id;
      const last = db.nameCooldown[userId] || 0;
      if (last && Date.now() - last < 5 * 60 * 60 * 1000) {
        const remaining = Math.ceil((5 * 60 * 60 * 1000 - (Date.now() - last)) / (60 * 60 * 1000));
        return message.reply(`⏳ يمكنك تغيير اسمك بعد ${remaining} ساعة.`);
      }
      const embed = new EmbedBuilder().setTitle('✏️ تغيير الاسم').setDescription('اضغط على الزر أدناه لتغيير اسمك المستعار في السيرفر.').setColor(0x2b2d31).setFooter({ text: 'يمكنك تغيير اسمك مرة كل 5 ساعات.' });
      if (generalImage) embed.setImage(generalImage);
      const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('open_name_modal').setLabel('✏️ تغيير الاسم').setStyle(ButtonStyle.Secondary));
      await message.channel.send({ embeds: [embed], components: [row] });
      return;
    }

    // ========== الردود التلقائية ==========
    if (cmd === 'رد_تلقائي') {
      if (!hasPermission(message.member, guildId)) return message.reply('❌ تحتاج صلاحية متحكم.');
      const keyword = args[0];
      const reply = args.slice(1).join(' ');
      if (!keyword || !reply) return message.reply('⚠️ الصيغة: `!رد_تلقائي [الكلمة] [الرد]`');
      const added = addAutoReply(guildId, keyword, reply);
      await logToChannel(guildId, { title: '💬 إضافة رد تلقائي', color: 0x2b2d31, description: `**${message.author}** أضاف رداً تلقائياً:\n**${keyword}** → ${reply}` });
      const embed = new EmbedBuilder()
        .setTitle(added ? '✅ تم إضافة رد تلقائي' : '🔄 تم تحديث رد تلقائي')
        .setColor(0x2b2d31)
        .setDescription(`**الكلمة:** ${keyword}\n**الرد:** ${reply}`)
        .setFooter({ text: 'سيرد البوت تلقائياً عند كتابة هذه الكلمة.' });
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
      await logToChannel(guildId, { title: '💬 إضافة رد تلقائي مع صورة', color: 0x2b2d31, description: `**${message.author}** أضاف رداً تلقائياً مع صورة:\n**${keyword}** → ${reply}` });
      const embed = new EmbedBuilder()
        .setTitle(added ? '✅ تم إضافة رد تلقائي مع صورة' : '🔄 تم تحديث رد تلقائي مع صورة')
        .setColor(0x2b2d31)
        .setDescription(`**الكلمة:** ${keyword}\n**الرد:** ${reply}`)
        .setImage(image)
        .setFooter({ text: 'سيرد البوت مع الصورة تلقائياً.' });
      if (generalImage) embed.setThumbnail(generalImage);
      await message.channel.send({ embeds: [embed] });
      return;
    }

    if (cmd === 'حذف_رد_تلقائي') {
      if (!hasPermission(message.member, guildId)) return message.reply('❌ تحتاج صلاحية متحكم.');
      const keyword = args.join(' ');
      if (!keyword) return message.reply('⚠️ اكتب الكلمة المفتاحية التي تريد حذفها.');
      const removed = removeAutoReply(guildId, keyword);
      if (!removed) return message.reply(`⚠️ لا يوجد رد تلقائي للكلمة "${keyword}".`);
      await logToChannel(guildId, { title: '🗑️ حذف رد تلقائي', color: 0x2b2d31, description: `**${message.author}** حذف الرد التلقائي للكلمة **${keyword}**` });
      const embed = new EmbedBuilder()
        .setTitle('🗑️ تم حذف الرد التلقائي')
        .setColor(0x2b2d31)
        .setDescription(`تم حذف الرد التلقائي للكلمة: **${keyword}**`);
      if (generalImage) embed.setImage(generalImage);
      await message.channel.send({ embeds: [embed] });
      return;
    }

    if (cmd === 'عرض_الردود') {
      const replies = getAutoReplies(guildId);
      if (!replies.length) return message.reply('📭 لا توجد ردود تلقائية في هذا السيرفر.');
      const list = replies.map((r, i) => `${i+1}. **${r.keyword}** → ${r.reply}${r.image ? ' (🖼️)' : ''}`).join('\n');
      const embed = new EmbedBuilder()
        .setTitle('💬 قائمة الردود التلقائية')
        .setColor(0x2b2d31)
        .setDescription(list)
        .setFooter({ text: `عدد الردود: ${replies.length}` });
      if (generalImage) embed.setImage(generalImage);
      await message.channel.send({ embeds: [embed] });
      return;
    }

    // ========== إيقاف البوت ==========
    if (cmd === 'إيقاف') {
      if (!isOwner(message.author.id)) return message.reply('❌ هذا الأمر للمالك فقط.');
      await message.reply('🛑 جاري الإيقاف...');
      process.exit(0);
      return;
    }

  } catch (error) {
    console.error('❌ خطأ في تنفيذ الأمر:', error);
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
      const config = getGuildConfig(guild.id);

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
        if (!hasPermission(interaction.member, interaction.guild.id)) {
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
        const last = db.nameCooldown[userId] || 0;
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
        db.nameCooldown[interaction.user.id] = Date.now();
        saveDB();
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
