module.exports = {

	// The secret token the bot uses to login
	botToken: ``,

	// The maximum length video a user can play in seconds
	maxVideoLength: 10800,

	// The default percentage volume
	defaultVolume: 25,

	// The character placed before commands
	cmdPrefix: `>`,

	// The ID of the bot's owner, they have full access
	ownerID: ``,

	// The API key to use google api services
	googleAPIKey: ``,

	// The link sent when the 'GetLink' command is used
	inviteLink: 'www.example.com/invite?id=092735472813',

	// The URL for the mongoDB database to use
	connectionString: 'mongodb://localhost:27017/MrHeroBots',

	// The level of debug messages to show in the console
	consoleDebugLevel: 'info',

	// The level of debug messages shown in the log file
	fileDebugLevel: 'debug',

	// IDs of users who have admin permissions
	adminUsers: [
		'12345678',
		'09876556',
	],

	// IDs of roles who have admin permissions
	admonRoles: [
		'67929844',
		'09375322',
	],
};
