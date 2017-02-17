module.exports = {
	//message sending with auto delete
	send: (channel, msg, options, life) => {
		if (typeof(options) === "number") {
			life = options;
			options = {};
		}
	    channel.send(msg, options).then(message => {
			if (life > 0) {
				message.delete(life);
			}
	    }).catch(e => {
	        console.log("error sending message" + e);
	    });
	},

	//do two arrays share any values
	arrShare: (target, search) => {
	    return search.some(function(v) {
	        return target.indexOf(v) >= 0;
	    });
	}
};
