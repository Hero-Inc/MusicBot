/*jshint esversion: 6*/
module.exports = {
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

	arrShare: (target, search) => {
	    return search.some(function(v) {
	        return target.indexOf(v) >= 0;
	    });
	}
};
