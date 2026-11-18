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
    SlashCommandBuilder
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

// Konfigurasi Node Lavalink Nodes
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

// Pendaftaran Slash Commands Lengkap (/play, /skip, /stop, /queue, /volume, /pause, /resume, /loop, /clear, /setup)
const commands = [
    new SlashCommandBuilder()
    .setName('play')
    .setDescription('Memutar lagu dari YouTube, YT Music, atau Spotify')
    .addStringOption(option =>
        option.setName('query')
        .setDescription('Judul lagu atau link lagu')
        .setRequired(true)),
    new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Melewati lagu yang sedang diputar'),
    new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Menghentikan musik dan mengeluarkan bot dari voice channel'),
    new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Menjeda lagu yang sedang diputar'),
    new SlashCommandBuilder()
    .setName('resume')
    .setDescription('Melanjutkan lagu yang dijeda'),
    new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Mengatur volume suara bot (1 - 100)')
    .addIntegerOption(option =>
        option.setName('level')
        .setDescription('Tingkat volume (1-100)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100)),
    new SlashCommandBuilder()
    .setName('loop')
    .setDescription('Mengubah mode pengulangan lagu')
    .addStringOption(option =>
        option.setName('mode')
        .setDescription('Pilih mode loop')
        .setRequired(true)
        .addChoices({ name: 'Off (Mati)', value: 'none' }, { name: 'Track (Ulang Lagu Ini)', value: 'track' }, { name: 'Queue (Ulang Semua Antrean)', value: 'queue' })),
    new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Membersihkan seluruh antrean musik'),
    new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Menampilkan daftar antrean lagu'),
    new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Membuat channel dan panel musik interaktif khusus')
].map(command => command.toJSON());

client.once('ready', async() => {
    console.log(`✅ Bot online sebagai ${client.user.tag}`);

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        console.log('🔄 Mendaftarkan Slash Commands (/) ...');
        await rest.put(
            Routes.applicationCommands(client.user.id), { body: commands },
        );
        console.log('✅ Slash Commands berhasil didaftarkan!');
    } catch (error) {
        console.error(error);
    }

    const activities = [
        { name: '/play <lagu> 🎵', type: ActivityType.Listening },
        { name: 'Bot Video And Music', type: ActivityType.Watching },
        { name: 'Dev : Alea', type: ActivityType.Listening },
        { name: 'Create : ELL', type: ActivityType.Watching }
    ];

    let index = 0;
    setInterval(() => {
        const current = activities[index];
        client.user.setActivity(current.name, { type: current.type });
        index = (index + 1) % activities.length;
    }, 15000);
});

// Event Lavalink
kazagumo.shoukaku.on('ready', (name) => console.log(`🟢 Lavalink Node "${name}" terhubung!`));
kazagumo.shoukaku.on('error', (name, error) => console.error(`🔴 Lavalink Error (${name}):`, error));

// Fungsi Update Panel Musik Dinamis
async function updateMusicPanel(player, guildId) {
    const channel = client.channels.cache.get(player.textId);
    if (!channel) return;

    const panelData = musicPanels.get(guildId);
    if (!panelData) return;

    try {
        const message = await channel.messages.fetch(panelData.messageId);
        if (!message) return;

        const currentTrack = player.queue.current;
        const queueList = player.queue.slice(0, 5).map((t, i) => `${i + 1}. **${t.title}** - \`${t.author}\``).join('\n') || 'Tidak ada antrean berikutnya.';

        const embed = new EmbedBuilder()
            .setColor('#1DB954')
            .setTitle('Patrick | Music');

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('music_previous').setEmoji('⏮️').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('music_pause').setEmoji('⏸️').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('music_skip').setEmoji('⏭️').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('music_stop').setEmoji('⏹️').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('music_loop').setEmoji('🔁').setStyle(ButtonStyle.Secondary)
        );

        if (currentTrack) {
            embed.setDescription(`🎶 **Sedang Memutar:**\n**[${currentTrack.title}](${currentTrack.uri})**\n👤 **Artis:** ${currentTrack.author}\n🎧 **Request oleh:** ${currentTrack.requester}\n🔊 **Volume:** ${player.volume}%\n\n📜 **DAFTAR ANTREAN:**\n${queueList}`)
                .setImage(currentTrack.thumbnail || 'https://media.discordapp.net/attachments/1007588463006203986/1123054895885451374/urlittleboy.gif');
        } else {
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
    updateMusicPanel(player, player.guildId);
    const channel = client.channels.cache.get(player.textId);
    if (channel) channel.send('✅ Antrean lagu habis, keluar dari voice channel.');
    player.destroy();
});

// Handler Interaksi Slash Commands & Tombol
client.on('interactionCreate', async(interaction) => {
    if (interaction.isChatInputCommand()) {
        const { commandName, options, guild, member, channel } = interaction;

        if (commandName === 'setup') {
            if (!member.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
                return interaction.reply({ content: '❌ Kamu memerlukan izin **Manage Channels**!', ephemeral: true });
            }

            try {
                const existingChannel = guild.channels.cache.find(c => c.name === 'patric-music');
                if (existingChannel) {
                    return interaction.reply({ content: `⚠️ Channel khusus musik sudah ada di <#${existingChannel.id}>!`, ephemeral: true });
                }

                const newChannel = await guild.channels.create({
                    name: 'patric-music',
                    type: ChannelType.GuildText,
                    topic: 'Music Request Channel for Patrick'
                });

                const setupEmbed = new EmbedBuilder()
                    .setColor('#1DB954')
                    .setTitle('Patrick | Music')
                    .setDescription('Join a Voice Channel and Type Song Link/Name to Play')
                    .setImage('https://media.discordapp.net/attachments/1007588463006203986/1123054895885451374/urlittleboy.gif');

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('music_previous').setEmoji('⏮️').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('music_pause').setEmoji('⏸️').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('music_skip').setEmoji('⏭️').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('music_stop').setEmoji('⏹️').setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId('music_loop').setEmoji('🔁').setStyle(ButtonStyle.Secondary)
                );

                const sentMessage = await newChannel.send({ embeds: [setupEmbed], components: [row] });

                musicPanels.set(guild.id, {
                    channelId: newChannel.id,
                    messageId: sentMessage.id
                });

                return interaction.reply({ content: `✅ Berhasil membuat panel kontrol musik di <#${newChannel.id}>!`, ephemeral: true });
            } catch (error) {
                console.error(error);
                return interaction.reply({ content: '❌ Terjadi kesalahan saat membuat channel setup.', ephemeral: true });
            }
        }

        if (commandName === 'play') {
            const query = options.getString('query');
            const voiceChannel = member.voice.channel;

            if (!voiceChannel) return interaction.reply({ content: '❌ Kamu harus masuk ke voice channel terlebih dahulu!', ephemeral: true });
            if (!kazagumo.shoukaku.nodes.size) return interaction.reply({ content: '❌ Server Lavalink sedang offline.', ephemeral: true });

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
                if (!result.tracks.length) return interaction.editReply('❌ Lagu tidak ditemukan.');

                if (result.type === 'PLAYLIST') {
                    for (const track of result.tracks) player.queue.add(track);
                    await interaction.editReply(`📑 Menambahkan **${result.tracks.length} lagu** dari playlist **${result.playlistName}**.`);
                } else {
                    player.queue.add(result.tracks[0]);
                    await interaction.editReply(`➕ Ditambahkan ke antrean: **${result.tracks[0].title}**`);
                }

                if (!player.playing && !player.paused) {
                    player.play();
                } else {
                    updateMusicPanel(player, guild.id);
                }
            } catch (error) {
                console.error(error);
                return interaction.editReply('❌ Terjadi kesalahan saat memutar musik.');
            }
        }

        if (commandName === 'skip') {
            const player = kazagumo.players.get(guild.id);
            if (!player) return interaction.reply({ content: '❌ Tidak ada lagu yang sedang diputar.', ephemeral: true });
            player.skip();
            return interaction.reply({ content: '⏭️ Lagu berhasil dilewati.' });
        }

        if (commandName === 'stop') {
            const player = kazagumo.players.get(guild.id);
            if (!player) return interaction.reply({ content: '❌ Bot tidak sedang memutar musik.', ephemeral: true });
            player.destroy();
            updateMusicPanel(player, guild.id);
            return interaction.reply({ content: '⏹️ Musik dihentikan dan bot keluar.' });
        }

        if (commandName === 'pause') {
            const player = kazagumo.players.get(guild.id);
            if (!player) return interaction.reply({ content: '❌ Tidak ada musik yang diputar.', ephemeral: true });
            if (player.paused) return interaction.reply({ content: '⚠️ Musik sudah dalam keadaan dijeda.', ephemeral: true });
            player.pause(true);
            return interaction.reply({ content: '⏸️ Musik berhasil dijeda.' });
        }

        if (commandName === 'resume') {
            const player = kazagumo.players.get(guild.id);
            if (!player) return interaction.reply({ content: '❌ Tidak ada musik yang diputar.', ephemeral: true });
            if (!player.paused) return interaction.reply({ content: '⚠️ Musik sedang tidak dijeda.', ephemeral: true });
            player.pause(false);
            return interaction.reply({ content: '▶️ Musik dilanjutkan kembali.' });
        }

        if (commandName === 'volume') {
            const player = kazagumo.players.get(guild.id);
            if (!player) return interaction.reply({ content: '❌ Bot tidak sedang memutar musik.', ephemeral: true });
            const level = options.getInteger('level');
            player.setVolume(level);
            updateMusicPanel(player, guild.id);
            return interaction.reply({ content: `🔊 Volume berhasil diubah ke: **${level}%**` });
        }

        if (commandName === 'loop') {
            const player = kazagumo.players.get(guild.id);
            if (!player) return interaction.reply({ content: '❌ Bot tidak sedang memutar musik.', ephemeral: true });
            const mode = options.getString('mode');
            player.setLoop(mode);
            return interaction.reply({ content: `🔁 Mode loop diatur ke: **${mode.toUpperCase()}**` });
        }

        if (commandName === 'clear') {
            const player = kazagumo.players.get(guild.id);
            if (!player || !player.queue.length) return interaction.reply({ content: '❌ Antrean kosong.', ephemeral: true });
            player.queue.clear();
            updateMusicPanel(player, guild.id);
            return interaction.reply({ content: '🗑️ Daftar antrean berhasil dibersihkan.' });
        }

        if (commandName === 'queue') {
            const player = kazagumo.players.get(guild.id);
            if (!player || !player.queue.current) return interaction.reply({ content: '❌ Antrean kosong.', ephemeral: true });
            const queueList = player.queue.slice(0, 10).map((t, i) => `${i + 1}. **${t.title}**`).join('\n');
            return interaction.reply({ content: `**Sedang Diputar:** ${player.queue.current.title}\n\n**Antrean Berikutnya:**\n${queueList || 'Tidak ada'}`, ephemeral: true });
        }
    }

    // Handler Tombol Panel Interaktif
    if (interaction.isButton()) {
        const player = kazagumo.players.get(interaction.guildId);
        if (!player) return interaction.reply({ content: '❌ Bot tidak sedang memutar musik!', ephemeral: true });

        const memberVoice = interaction.member.voice.channel;
        if (!memberVoice || memberVoice.id !== player.voiceId) {
            return interaction.reply({ content: '❌ Kamu harus berada di voice channel yang sama!', ephemeral: true });
        }

        if (interaction.customId === 'music_skip') {
            player.skip();
            await interaction.reply({ content: '⏭️ Lagu dilewati!', ephemeral: true });
        } else if (interaction.customId === 'music_pause') {
            if (player.paused) {
                player.pause(false);
                await interaction.reply({ content: '▶️ Musik dilanjutkan!', ephemeral: true });
            } else {
                player.pause(true);
                await interaction.reply({ content: '⏸️ Musik dijeda.', ephemeral: true });
            }
        } else if (interaction.customId === 'music_stop') {
            player.destroy();
            updateMusicPanel(player, interaction.guildId);
            await interaction.reply({ content: '⏹️ Musik dihentikan.', ephemeral: true });
        } else if (interaction.customId === 'music_loop') {
            const currentLoop = player.loop;
            if (currentLoop === 'track') {
                player.setLoop('queue');
                await interaction.reply({ content: '🔁 Mode Loop: **Queue**', ephemeral: true });
            } else if (currentLoop === 'queue') {
                player.setLoop('none');
                await interaction.reply({ content: '🔁 Mode Loop: **Off**', ephemeral: true });
            } else {
                player.setLoop('track');
                await interaction.reply({ content: '🔁 Mode Loop: **Track**', ephemeral: true });
            }
        }
    }
});

// Fitur Ketik Langsung di Channel "patric-music" Tanpa Prefix Slash
client.on('messageCreate', async(message) => {
    if (message.author.bot || !message.guild || message.channel.name !== 'patric-music') return;

    const query = message.content.trim();
    if (!query) return;

    try { await message.delete(); } catch (e) {}

    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) return;

    if (!kazagumo.shoukaku.nodes.size) return;

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
        if (!result.tracks.length) return;

        if (result.type === 'PLAYLIST') {
            for (const track of result.tracks) player.queue.add(track);
        } else {
            player.queue.add(result.tracks[0]);
        }

        if (!player.playing && !player.paused) {
            player.play();
        } else {
            updateMusicPanel(player, message.guild.id);
        }
    } catch (error) {
        console.error(error);
    }
});

client.login(process.env.DISCORD_TOKEN);