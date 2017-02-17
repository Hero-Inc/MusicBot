var search = "Hello/ this's a tes%*92 $?#& te3#&";
search = search.split(" ");
search.splice(0, 1);
for (var i = 0; i < search.length; i++) {
	search[i] = encodeURI(search[i]);
}
console.log(search);
