require('dotenv').config();
const {
    Client,
    GatewayIntentBits,
    ActivityType,
    EmbedBuilder,
    ChannelType,
    PermissionsBitField,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    REST,
    Routes,
    SlashCommandBuilder,
    MessageFlags
} = require('discord.js');
const { Connectors } = require('shoukaku');
const { Kazagumo, Plugins } = require('kazagumo');
const Spotify = require('kazagumo-spotify');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const musicPanels = new Map();

const Nodes = [{
    name: process.env.LAVALINK_NAME,
    url: process.env.LAVALINK_URL,
    auth: process.env.LAVALINK_AUTH,
    secure: true
}];

const kazagumo = new Kazagumo({
    defaultSearchEngine: 'youtube_music',
    plugins: [
        new Spotify({
            clientId: process.env.SPOTIFY_CLIENT_ID,
            clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
            playlistPageLimit: 2,
            albumPageLimit: 2,
            searchLimit: 10,
            searchMarket: 'ID'
        }),
        new Plugins.PlayerMoved(client)
    ],
    send: (guildId, payload) => {
        const guild = client.guilds.cache.get(guildId);
        if (guild) guild.shard.send(payload);
    }
}, new Connectors.DiscordJS(client), Nodes);

const commands = [
    new SlashCommandBuilder()
    .setName('play')
    .setDescription('Memutar lagu dari YouTube, YT Music, atau Spotify')
    .addStringOption(option =>
        option.setName('query')
        .setDescription('Judul lagu atau link lagu')
        .setRequired(true)),
    new SlashCommandBuilder().setName('skip').setDescription('Melewati lagu yang sedang diputar'),
    new SlashCommandBuilder().setName('stop').setDescription('Menghentikan musik dan keluar dari voice channel'),
    new SlashCommandBuilder().setName('pause').setDescription('Menjeda lagu'),
    new SlashCommandBuilder().setName('resume').setDescription('Melanjutkan lagu'),
    new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Mengatur volume suara (1-100)')
    .addIntegerOption(option =>
        option.setName('level').setDescription('Tingkat volume').setRequired(true).setMinValue(1).setMaxValue(100)),
    new SlashCommandBuilder()
    .setName('loop')
    .setDescription('Mode pengulangan lagu')
    .addStringOption(option =>
        option.setName('mode').setDescription('Pilih mode').setRequired(true)
        .addChoices({ name: 'Off', value: 'none' }, { name: 'Track', value: 'track' }, { name: 'Queue', value: 'queue' })),
    new SlashCommandBuilder().setName('clear').setDescription('Membersihkan antrean'),
    new SlashCommandBuilder().setName('queue').setDescription('Menampilkan daftar antrean'),
    new SlashCommandBuilder().setName('setup').setDescription('Membuat panel kontrol musik khusus')
].map(command => command.toJSON());

client.once('ready', async() => {
    console.log(`<:stick:1570799135009808468> Bot online sebagai ${client.user.tag}`);

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('<:stick:1570799135009808468> Slash Commands berhasil didaftarkan!');
    } catch (error) {
        console.error(error);
    }

    const activities = [
        { name: '/play <lagu> <:smusic:1570799106434277459>', type: ActivityType.Listening },
        { name: 'Bot Video & Music', type: ActivityType.Watching }
    ];

    let index = 0;
    setInterval(() => {
        const current = activities[index];
        client.user.setActivity(current.name, { type: current.type });
        index = (index + 1) % activities.length;
    }, 15000);
});

kazagumo.shoukaku.on('ready', (name) => console.log(`🟢 Lavalink Node "${name}" terhubung!`));
kazagumo.shoukaku.on('error', (name, error) => console.error(`🔴 Lavalink Error (${name}):`, error));

// Fungsi pembantu untuk auto-hapus pesan balasan bot
async function sendAutoDeleteMessage(interactionOrChannel, content, time = 4000, isEdit = false) {
    try {
        let sentMsg;
        if (isEdit) {
            sentMsg = await interactionOrChannel.editReply(content);
        } else if (interactionOrChannel.reply) {
            sentMsg = await interactionOrChannel.reply(content);
        } else {
            sentMsg = await interactionOrChannel.send(content);
        }

        const messageToDelete = sentMsg.resource ? await interactionOrChannel.fetchReply() : sentMsg;

        setTimeout(async() => {
            try {
                if (messageToDelete && messageToDelete.deletable) {
                    await messageToDelete.delete();
                }
            } catch (err) {}
        }, time);
    } catch (e) {
        console.error('Gagal auto-delete pesan:', e);
    }
}

// Fungsi Update Panel Musik Dinamis (Support Reset ke Default)
async function updateMusicPanel(player, guildId, forceDefault = false) {
    const channel = client.channels.cache.get(player ? player.textId : null);

    const panelData = musicPanels.get(guildId);
    if (!panelData) return;

    const targetChannel = channel || client.channels.cache.get(panelData.channelId);
    if (!targetChannel) return;

    try {
        const message = await targetChannel.messages.fetch(panelData.messageId);
        if (!message) return;

        const currentTrack = forceDefault ? null : (player ? player.queue.current : null);
        const queueList = (player && player.queue && player.queue.length > 0) ?
            player.queue.slice(0, 5).map((t, i) => `${i + 1}. **${t.title}** - \`${t.author}\``).join('\n') :
            'Tidak ada antrean berikutnya.';

        const embed = new EmbedBuilder().setColor('#b91d1d').setTitle('Patrick | Music');

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('music_previous').setEmoji('<:sleft:1570799091112349796>').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('music_pause').setEmoji('<:spause:1570799115158429789>').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('music_skip').setEmoji('<:sright:1570799127850262592>').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('music_stop').setEmoji('<:shomes:1570799078650945586>').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('music_loop').setEmoji('<:spartner:1570799113510068284>').setStyle(ButtonStyle.Secondary)
        );

        if (currentTrack) {
            embed.setDescription(`🎶 **Sedang Memutar:**\n**[${currentTrack.title}](${currentTrack.uri})**\n👤 **Artis:** ${currentTrack.author}\n🎧 **Request oleh:** ${currentTrack.requester.username || currentTrack.requester}\n<:sspeak:1570799131520147458> **Volume:** ${player.volume}%\n\n📜 **DAFTAR ANTREAN:**\n${queueList}`)
                .setImage(currentTrack.thumbnail || 'https://media.discordapp.net/attachments/1007588463006203986/1123054895885451374/urlittleboy.gif');
        } else {
            // Kembali ke mode default (standby GIF) ketika kosong / stop
            embed.setDescription('Join a Voice Channel and Type Song Link/Name to Play')
                .setImage('https://media.discordapp.net/attachments/1007588463006203986/1123054895885451374/urlittleboy.gif');
        }

        await message.edit({ embeds: [embed], components: [row] });
    } catch (e) {
        console.error('Gagal memperbarui panel musik:', e);
    }
}

kazagumo.on('playerStart', (player, track) => updateMusicPanel(player, player.guildId));
kazagumo.on('playerEnd', (player) => updateMusicPanel(player, player.guildId));

kazagumo.on('playerEmpty', (player) => {
    const guildId = player.guildId;
    const textId = player.textId;

    player.destroy();
    updateMusicPanel(null, guildId, true);

    const channel = client.channels.cache.get(textId);
    if (channel) {
        channel.send('<:stick:1570799135009808468> Antrean lagu habis, keluar dari voice channel.').then(msg => {
            setTimeout(() => msg.delete().catch(() => {}), 4000);
        });
    }
});

// Handler Slash Commands & Button Interactions
client.on('interactionCreate', async(interaction) => {
    if (interaction.isChatInputCommand()) {
        const { commandName, options, guild, member, channel } = interaction;

        if (commandName === 'setup') {
            if (!member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
                return sendAutoDeleteMessage(interaction, { content: '<:scross:1570799045176467577> Kamu memerlukan izin **Manage Channels**!', flags: MessageFlags.Ephemeral }, 4000);
            }

            try {
                const existingChannel = guild.channels.cache.find(c => c.name === 'patric-music');
                if (existingChannel) {
                    return sendAutoDeleteMessage(interaction, { content: `<:sinfo:1570799084338413648> Channel khusus musik sudah ada di <#${existingChannel.id}>!`, flags: MessageFlags.Ephemeral }, 4000);
                }

                const newChannel = await guild.channels.create({
                    name: 'patric-music',
                    type: ChannelType.GuildText,
                    topic: 'Music Request Channel for Patrick'
                });

                const setupEmbed = new EmbedBuilder()
                    .setColor('#b91d1d')
                    .setTitle('Patrick | Music')
                    .setDescription('Join a Voice Channel and Type Song Link/Name to Play')
                    .setImage('https://media.discordapp.net/attachments/1007588463006203986/1123054895885451374/urlittleboy.gif');

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('music_previous').setEmoji('<:sleft:1570799091112349796>').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('music_pause').setEmoji('<:spause:1570799115158429789>').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('music_skip').setEmoji('<:sright:1570799127850262592>').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('music_stop').setEmoji('<:shomes:1570799078650945586>').setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId('music_loop').setEmoji('<:spartner:1570799113510068284>').setStyle(ButtonStyle.Secondary)
                );

                const sentMessage = await newChannel.send({ embeds: [setupEmbed], components: [row] });

                musicPanels.set(guild.id, {
                    channelId: newChannel.id,
                    messageId: sentMessage.id
                });

                return sendAutoDeleteMessage(interaction, { content: `<:stick:1570799135009808468> Berhasil membuat panel kontrol musik di <#${newChannel.id}>!`, flags: MessageFlags.Ephemeral }, 4000);
            } catch (error) {
                console.error(error);
                return sendAutoDeleteMessage(interaction, { content: '<:scross:1570799045176467577> Terjadi kesalahan saat membuat channel setup.', flags: MessageFlags.Ephemeral }, 4000);
            }
        }

        if (commandName === 'play') {
            const query = options.getString('query');
            const voiceChannel = member.voice.channel;

            if (!voiceChannel) return sendAutoDeleteMessage(interaction, { content: '<:scross:1570799045176467577> Kamu harus masuk ke voice channel terlebih dahulu!', flags: MessageFlags.Ephemeral }, 4000);
            if (!kazagumo.shoukaku.nodes.size) return sendAutoDeleteMessage(interaction, { content: '<:scross:1570799045176467577> Server Lavalink sedang offline.', flags: MessageFlags.Ephemeral }, 4000);

            await interaction.deferReply();

            try {
                let textChannelId = channel.id;
                const musicChan = guild.channels.cache.find(c => c.name === 'patric-music');
                if (musicChan) textChannelId = musicChan.id;

                const player = await kazagumo.createPlayer({
                    guildId: guild.id,
                    textId: textChannelId,
                    voiceId: voiceChannel.id,
                    volume: 80
                });

                if (!musicPanels.has(guild.id) && musicChan) {
                    const messages = await musicChan.messages.fetch({ limit: 5 });
                    const botMsg = messages.find(m => m.author.id === client.user.id && m.components.length > 0);
                    if (botMsg) {
                        musicPanels.set(guild.id, { channelId: musicChan.id, messageId: botMsg.id });
                    }
                }

                const result = await kazagumo.search(query, { requester: member.user });
                if (!result.tracks.length) return sendAutoDeleteMessage(interaction, '<:scross:1570799045176467577> Lagu tidak ditemukan.', 4000, true);

                if (result.type === 'PLAYLIST') {
                    for (const track of result.tracks) player.queue.add(track);
                    await sendAutoDeleteMessage(interaction, `<:smusic:1570799106434277459> Menambahkan **${result.tracks.length} lagu** dari playlist **${result.playlistName}**.`, 4000, true);
                } else {
                    player.queue.add(result.tracks[0]);
                    await sendAutoDeleteMessage(interaction, `<:slol:1570799092710383646> Ditambahkan ke antrean: **${result.tracks[0].title}**`, 4000, true);
                }

                if (!player.playing && !player.paused) {
                    player.play();
                } else {
                    updateMusicPanel(player, guild.id);
                }
            } catch (error) {
                console.error(error);
                return sendAutoDeleteMessage(interaction, '<:scross:1570799045176467577> Terjadi kesalahan saat memutar musik.', 4000, true);
            }
        }

        if (commandName === 'skip') {
            const player = kazagumo.players.get(guild.id);
            if (!player) return sendAutoDeleteMessage(interaction, { content: '<:scross:1570799045176467577> Tidak ada lagu yang sedang diputar.', flags: MessageFlags.Ephemeral }, 4000);
            player.skip();
            return sendAutoDeleteMessage(interaction, '<:sright:1570799127850262592> Lagu berhasil dilewati.', 4000);
        }

        if (commandName === 'stop') {
            const player = kazagumo.players.get(guild.id);
            if (!player) return sendAutoDeleteMessage(interaction, { content: '<:scross:1570799045176467577> Bot tidak sedang memutar musik.', flags: MessageFlags.Ephemeral }, 4000);

            const guildId = guild.id;
            player.destroy();
            updateMusicPanel(null, guildId, true);

            return sendAutoDeleteMessage(interaction, '<:shomes:1570799078650945586> Musik dihentikan dan bot keluar.', 4000);
        }

        if (commandName === 'pause') {
            const player = kazagumo.players.get(guild.id);
            if (!player) return sendAutoDeleteMessage(interaction, { content: '<:scross:1570799045176467577> Tidak ada musik yang diputar.', flags: MessageFlags.Ephemeral }, 4000);
            if (player.paused) return sendAutoDeleteMessage(interaction, { content: '<:sinfo:1570799084338413648> Musik sudah dalam keadaan dijeda.', flags: MessageFlags.Ephemeral }, 4000);
            player.pause(true);
            return sendAutoDeleteMessage(interaction, '<:spause:1570799115158429789> Musik berhasil dijeda.', 4000);
        }

        if (commandName === 'resume') {
            const player = kazagumo.players.get(guild.id);
            if (!player) return sendAutoDeleteMessage(interaction, { content: '<:scross:1570799045176467577> Tidak ada musik yang diputar.', flags: MessageFlags.Ephemeral }, 4000);
            if (!player.paused) return sendAutoDeleteMessage(interaction, { content: '<:sinfo:1570799084338413648> Musik sedang tidak dijeda.', flags: MessageFlags.Ephemeral }, 4000);
            player.pause(false);
            return sendAutoDeleteMessage(interaction, '<:splay:1570799122766757908> Musik dilanjutkan kembali.', 4000);
        }

        if (commandName === 'volume') {
            const player = kazagumo.players.get(guild.id);
            if (!player) return sendAutoDeleteMessage(interaction, { content: '<:scross:1570799045176467577> Bot tidak sedang memutar musik.', flags: MessageFlags.Ephemeral }, 4000);
            const level = options.getInteger('level');
            player.setVolume(level);
            updateMusicPanel(player, guild.id);
            return sendAutoDeleteMessage(interaction, `<:sspeak:1570799131520147458> Volume berhasil diubah ke: **${level}%**`, 4000);
        }

        if (commandName === 'loop') {
            const player = kazagumo.players.get(guild.id);
            if (!player) return sendAutoDeleteMessage(interaction, { content: '<:scross:1570799045176467577> Bot tidak sedang memutar musik.', flags: MessageFlags.Ephemeral }, 4000);
            const mode = options.getString('mode');
            player.setLoop(mode);
            return sendAutoDeleteMessage(interaction, `<:spartner:1570799113510068284> Mode loop diatur ke: **${mode.toUpperCase()}**`, 4000);
        }

        if (commandName === 'clear') {
            const player = kazagumo.players.get(guild.id);
            if (!player || !player.queue.length) return sendAutoDeleteMessage(interaction, { content: '<:scross:1570799045176467577> Antrean kosong.', flags: MessageFlags.Ephemeral }, 4000);
            player.queue.clear();
            updateMusicPanel(player, guild.id);
            return sendAutoDeleteMessage(interaction, '<:sdelete:1570799048804405339> Daftar antrean berhasil dibersihkan.', 4000);
        }

        if (commandName === 'queue') {
            const player = kazagumo.players.get(guild.id);
            if (!player || !player.queue.current) return sendAutoDeleteMessage(interaction, { content: '<:scross:1570799045176467577> Antrean kosong.', flags: MessageFlags.Ephemeral }, 4000);
            const queueList = player.queue.slice(0, 10).map((t, i) => `${i + 1}. **${t.title}**`).join('\n');
            return sendAutoDeleteMessage(interaction, `**Sedang Diputar:** ${player.queue.current.title}\n\n**Antrean Berikutnya:**\n${queueList || 'Tidak ada'}`, 6000);
        }
    }

    if (interaction.isButton()) {
        const player = kazagumo.players.get(interaction.guildId);
        if (!player) return interaction.reply({ content: '<:scross:1570799045176467577> Bot tidak sedang memutar musik!', flags: MessageFlags.Ephemeral });

        const memberVoice = interaction.member.voice.channel;
        if (!memberVoice || memberVoice.id !== player.voiceId) {
            return interaction.reply({ content: '<:scross:1570799045176467577> Kamu harus berada di voice channel yang sama!', flags: MessageFlags.Ephemeral });
        }

        if (interaction.customId === 'music_skip') {
            player.skip();
            await interaction.reply({ content: '<:sright:1570799127850262592> Lagu dilewati!', flags: MessageFlags.Ephemeral });
        } else if (interaction.customId === 'music_pause') {
            if (player.paused) {
                player.pause(false);
                await interaction.reply({ content: '<:splay:1570799122766757908> Musik dilanjutkan!', flags: MessageFlags.Ephemeral });
            } else {
                player.pause(true);
                await interaction.reply({ content: '<:spause:1570799115158429789> Musik dijeda!', flags: MessageFlags.Ephemeral });
            }
        } else if (interaction.customId === 'music_stop') {
            const guildId = interaction.guildId;
            player.destroy();
            updateMusicPanel(null, guildId, true);
            await interaction.reply({ content: '<:shomes:1570799078650945586> Musik dihentikan.', flags: MessageFlags.Ephemeral });
        } else if (interaction.customId === 'music_loop') {
            const currentLoop = player.loop;
            if (currentLoop === 'track') {
                player.setLoop('queue');
                await interaction.reply({ content: '<:spartner:1570799113510068284> Mode Loop: **Queue**', flags: MessageFlags.Ephemeral });
            } else if (currentLoop === 'queue') {
                player.setLoop('none');
                await interaction.reply({ content: '<:spartner:1570799113510068284> Mode Loop: **Off**', flags: MessageFlags.Ephemeral });
            } else {
                player.setLoop('track');
                await interaction.reply({ content: '<:spartner:1570799113510068284> Mode Loop: **Track**', flags: MessageFlags.Ephemeral });
            }
        }
    }
});

// FITUR AUTO-CLEANUP DI CHANNEL KHUSUS "patric-music"
client.on('messageCreate', async(message) => {
    if (message.author.bot || !message.guild || message.channel.name !== 'patric-music') return;

    const query = message.content.trim();

    if (!query && message.attachments.size > 0) {
        try { await message.delete(); } catch (e) {}
        return sendAutoDeleteMessage(message.channel, `<:scross:1570799045176467577> <@${message.author.id}>, kirim gambar/file tidak diizinkan di channel musik ini!`, 4000);
    }

    if (!query) {
        try { await message.delete(); } catch (e) {}
        return;
    }

    try { await message.delete(); } catch (e) {}

    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) {
        return sendAutoDeleteMessage(message.channel, `<:scross:1570799045176467577> <@${message.author.id}>, kamu harus masuk ke voice channel terlebih dahulu!`, 4000);
    }

    if (!kazagumo.shoukaku.nodes.size) {
        return sendAutoDeleteMessage(message.channel, `<:scross:1570799045176467577> <@${message.author.id}>, server Lavalink sedang offline.`, 4000);
    }

    try {
        const player = await kazagumo.createPlayer({
            guildId: message.guild.id,
            textId: message.channel.id,
            voiceId: voiceChannel.id,
            volume: 80
        });

        if (!musicPanels.has(message.guild.id)) {
            const messages = await message.channel.messages.fetch({ limit: 5 });
            const botMsg = messages.find(m => m.author.id === client.user.id && m.components.length > 0);
            if (botMsg) {
                musicPanels.set(message.guild.id, { channelId: message.channel.id, messageId: botMsg.id });
            }
        }

        const result = await kazagumo.search(query, { requester: message.author });

        if (!result.tracks.length) {
            return sendAutoDeleteMessage(message.channel, `<:scross:1570799045176467577> <@${message.author.id}>, lagu **"${query}"** tidak ditemukan atau dilarang chat selain request musik!`, 4000);
        }

        if (result.type === 'PLAYLIST') {
            for (const track of result.tracks) player.queue.add(track);
            sendAutoDeleteMessage(message.channel, `<:smusic:1570799106434277459> Menambahkan **${result.tracks.length} lagu** dari playlist **${result.playlistName}** ke antrean.`, 4000);
        } else {
            player.queue.add(result.tracks[0]);
            sendAutoDeleteMessage(message.channel, `<:slol:1570799092710383646> Ditambahkan ke antrean oleh <@${message.author.id}>: **${result.tracks[0].title}**`, 4000);
        }

        if (!player.playing && !player.paused) {
            player.play();
        } else {
            updateMusicPanel(player, message.guild.id);
        }
    } catch (error) {
        console.error(error);
        sendAutoDeleteMessage(message.channel, `<:scross:1570799045176467577> Terjadi kesalahan saat memutar musik.`, 4000);
    }
});

client.login(process.env.DISCORD_TOKEN);