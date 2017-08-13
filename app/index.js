//node imports
const FileSystem = require("fs");

//external lib imports
const JsonFile = require("jsonfile");
const Url = require("url");

//my imports
const DiscordUtil = require("discordjs-util");

//app component imports
const GuildData = require("./models/guild-data.js");
const FeedData = require("./models/feed-data.js");

//global vars
const SAVE_FILE = "./guilds.json";

module.exports = (client) => {
	const config = require("./config.json");

	const guildsData = FileSystem.existsSync(SAVE_FILE) ? fromJSON(JsonFile.readFileSync(SAVE_FILE)) : {};
	setInterval(() => writeFile(guildsData), config.saveIntervalSec * 1000);

	parseLinksInGuilds(client.guilds, guildsData).then(writeFile(guildsData));

	//set up an interval to check all the feeds
	checkFeedsInGuilds(client.guilds, guildsData);
	setInterval(() => checkFeedsInGuilds(client.guilds, guildsData), config.feedCheckIntervalSec * 1000);

	//set up an on message handler to detect when links are posted
	client.on("message", message => {
		if (message.author.id !== client.user.id) { //check the bot isn't triggering itself
			if (message.channel.type === "dm")
				HandleMessage.DM(client, config, message);
			else if (message.channel.type === "text" && message.member)
				HandleMessage.Text(client, config, message, guildsData);
		}
	});
};

const HandleMessage = {
	DM: (client, config, message) => {
		message.reply("This bot does not have any handling for direct messages. To learn more or get help please visit http://benji7425.github.io, or join my Discord server here: https://discord.gg/SSkbwSJ");
	},
	Text: (client, config, message, guildsData) => {
		//handle admins invoking commands
		if (message.content.startsWith(message.guild.me.toString()) //user is @mention-ing the bot
			&& message.member.permissions.has("ADMINISTRATOR")) //user has admin perms
		{
			const params = message.content.split(" "); //split the message at the spaces
			switch (params[1]) {
				//add handling for different commands here
				case config.commands.version:
					message.reply("v" + require("../package.json").version);
					break;
				case config.commands.addFeed:
					addFeed(client, guildsData, message);
					break;
			}
		}
	}
};

function addFeed(client, guildsData, message) {
	const parameters = message.content.split(" "); //expect !addfeed <url> <channelName> <roleName>

	const channel = message.mentions.channels.first();
	if(!channel)
		return message.reply("Please tag a channel with #channel-name");

	const feedUrl = parameters[2], channelName = channel.name, roleName = parameters[4];

	if (!Url.parse(feedUrl).host)
		return message.reply("Please supply a valid url");

	if (!feedUrl || !channelName)
		return message.reply("Please supply all the needed fields in this format:\n add-feed url channel-name role-name");

	const feedData = new FeedData({
		url: feedUrl,
		channelName: channelName,
		roleName: roleName
	});

	//ask the user if they're happy with the details they set up, save if yes, don't if no
	DiscordUtil.ask(client, message.channel, message.member, "Are you happy with this?\n ```JavaScript\n" + JSON.stringify(feedData, null, "\n") + "```")
		.then(responseMessage => {

			//if they responded yes, save the feed and let them know, else tell them to start again
			if (responseMessage.content.toLowerCase() === "yes") {
				if (!guildsData[message.guild.id])
					guildsData[message.guild.id] = new GuildData({ id: message.guild.id, feeds: [] });

				guildsData[message.guild.id].feeds.push(feedData);
				writeFile(guildsData);
				responseMessage.reply("Your new feed has been saved!");
			}
			else
				responseMessage.reply("Your feed has not been saved, please add it again with the correct details");
		});
}

function checkFeedsInGuilds(guilds, guildsData) {
	Object.keys(guildsData).forEach(key => guildsData[key].checkFeeds(guilds));
}

function parseLinksInGuilds(guilds, guildsData) {
	const promises = [];
	for (let guild of guilds) {
		const guildData = guildsData[guild.id];
		if (guildData)
			promises.push(guildData.cachePastPostedLinks());
	}
	return Promise.all(promises);
}

function writeFile(guildsData) {
	JsonFile.writeFile(SAVE_FILE, guildsData, err => { if (err) DiscordUtil.dateError("Error writing file", err); });
}

function fromJSON(json) {
	const guildsData = Object.keys(json);
	guildsData.forEach(guildID => { json[guildID] = new GuildData(json[guildID]); });
	return json;
}