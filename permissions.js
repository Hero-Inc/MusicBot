module.exports = {
	admin: { //Full access
		users: [],
		roles: []
	},
	default: { //Commands that everyone can use except those who are blacklisted
		commands: [`ping`, `foo`, `help`, `queue`, `tag`, `groups`, `roll`, `taglist`]
	},
	blacklist: { //Can use no commands
		users: [],
		roles: []
	},
	dj: { //Can use all music based commands
		commands: [`summon`, `play`, `pause`, `resume`, `skip`, `clear`, `remove`, `volume`, `move`, `shuffle`],
		users: [],
		roles: []
	}
};
