import db from '../util/sql'
import { exception } from 'winston';

const query = {
	// give the query a unique name
	name: 'select-word-features',
	text: `SELECT * FROM word_features WHERE wid = $1`,
	values: [1]
}

const to_exclude = new Set([
	"wid",
	"trailer_utf8"
])

const validations = [{
	is_valid: params => params.hasOwnProperty("wid"),
	message: "Invalid request, needs an object like { wid: n }."
},
{
	is_valid: params => Number.isInteger(params.wid) && params.wid >= 1,
	message: "Invalid wid, must be a positive integer."
}]
const validate = (validations, params) => {
	for (let i in validations) {
		const v = validations[i]
		if (!v.is_valid(params))
			return { "error": v.message }
	}
	return true
}

const wordLookup = (params) => new Promise((resolve, reject) => {
	// validate param
	const is_valid = validate(validations, params)
	if (is_valid !== true) {
		reject(is_valid)
	}

	query.values = [+params.wid]
	db.query(query).then(results => {

		// Filter out unwanted (null, or non-feature columns) features
		const features = {}
		for (let k in results.rows[0]) {
			const value = results.rows[0][k]
			if (value &&
				!to_exclude.has(k) &&
				!k.endsWith("_node")) {
				features[k] = value
			}
		}

		resolve({
			"wid": params.wid,
			"results": features
		})
	}).catch(error => {
		console.log(error)
		return error
	})
})
export { wordLookup }