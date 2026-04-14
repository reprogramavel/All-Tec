async function fetchTextChannel(client, channelId) {
  const channel = await client.channels.fetch(channelId);

  if (!channel || typeof channel.isText !== 'function' || !channel.isText()) {
    return null;
  }

  return channel;
}

async function fetchTextChannelsFromGuild(client, guildId) {
  const guild = await client.guilds.fetch(guildId);

  if (!guild) {
    return [];
  }

  const channels = await guild.channels.fetch();

  return channels
    .filter((channel) => channel && typeof channel.isText === 'function' && channel.isText())
    .map((channel) => channel);
}

async function collectOwnMessages(channel, userId) {
  const allMessages = [];
  let lastMessageId;
  let fetched;

  do {
    const options = { limit: 100 };
    if (lastMessageId) {
      options.before = lastMessageId;
    }

    fetched = await channel.messages.fetch(options);
    const userMessages = fetched.filter((message) => message.author.id === userId);
    allMessages.push(...userMessages.values());

    if (fetched.size > 0) {
      lastMessageId = fetched.last().id;
    }
  } while (fetched.size === 100);

  return allMessages;
}

module.exports = {
  fetchTextChannel,
  fetchTextChannelsFromGuild,
  collectOwnMessages,
};
