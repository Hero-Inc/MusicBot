module.exports = {
	// message sending with auto delete
	send: (channel, msg, options, life) => {
		if (typeof options === `number`) {
			life = options;
			options = {};
		}
		channel.send(msg, options)
			.then(message => {
				if (life > 0) {
					message.delete(life);
				}
			})
			.catch(e => {
				console.log(`error sending message: ${e}`);
			});
	},

	// do two arrays share any values?
	// I got this from a stackoverflow question but forgot to grab the link and now I can't find it again
	arrShare: (target, search) => search.some((v) => target.indexOf(v) >= 0),
};
