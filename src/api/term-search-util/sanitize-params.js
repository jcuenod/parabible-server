
const availableKeys = new Set(["_sp", "_vs", "_vt", "_voc_utf8", "_tricons", "_gn", "_nu", "_lxxlexeme"])
const verify = key => availableKeys.has(key)
const keysAreValid = keys => keys.reduce((a,v,i) => a && verify(v), true)
const validateKeysOrThrow = keys => {
	if (keysAreValid(keys)) return true
	console.log(keys)
	throw new Exception("Invalid key, you can't just feed in whatever you want, you know...")
}


const sanitizeParams = params => {
	// make sure we don't have anything other than UID, data and inverted:

	// validate all the keys in each termQuery:
	validateKeysOrThrow

	return {
		tree_node_type: "_clause_node"
		term_queries: []
	}
}
export default sanitizeParams