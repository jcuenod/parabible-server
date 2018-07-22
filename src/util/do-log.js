const doLog = process.env.NODE_ENV === 'production' ? false : true

const consoleLog = async (...debug) => {
	if (doLog) {
		console.log(...debug)
	}
}
export default { consoleLog }