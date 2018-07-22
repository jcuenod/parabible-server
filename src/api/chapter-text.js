import book_names from '../../data/book_names.json'
// import { _wordsThatMatchQuery } from './term-search'

const allowedTexts = [
	"wlc",
	"net",
	"lxx",
	"sbl"
]

const ridlistText = (ridlist, unfilteredParamTexts, db) => {
	const filteredTextList = allowedTexts.filter(t => unfilteredParamTexts.has(t))
	if (filteredTextList.length === 0)
		filteredTextList.push("net")
	const requestedTextsSet = new Set(filteredTextList)

	return new Promise((resolve, reject) => {
		let ridlistResponse = {}
		//TODO: change "in" to {$gte: min, $lt: max}
		//[or at least make it a possibilty
		// - we need the ridlist idea for search results
		// - but definitely not for chapters
		const cursor = db.collection("verse_data").find({ rid: { $in: ridlist } })
		cursor.each((err, doc) => {
			if (err)
				console.log("ERROR", err)
			if (doc != null) {
				ridlistResponse[doc["rid"]] = {}
				requestedTextsSet.forEach(text => {
					if (doc.hasOwnProperty(text)) {
						ridlistResponse[doc["rid"]][text] = doc[text]
					}
				})
			} else {
				resolve(ridlistResponse)
			}
		})
	})
}

const chapterText = (params, db) => {
	const ref = params.reference
	const unfilteredParamTexts = params["texts"] ? new Set(params["texts"]) : new Set([])

	// let highlights = {}
	// if (params.hasOwnProperty("search_terms")) {
	// 	params.search_terms.forEach(st => {
	// 		highlights[st.uid] = _wordsThatMatchQuery(st.data, [ref.book], ref.chapter)
	// 	})
	// }

	const minv = book_names[ref.book] * 10000000 + ref.chapter * 1000
	const maxv = book_names[ref.book] * 10000000 + (ref.chapter+1) * 1000
	return new Promise((resolve, reject) => {
		ridlistText(Array.from({length: maxv-minv}, (v, k) => k+minv), unfilteredParamTexts, db).then((texts) => {
			const returnVal = {
				"reference": params.reference,
				"text": texts
			}
			// if (Object.keys(highlights).length > 0)
			// 	returnVal["highlights"] = highlights
			resolve(returnVal)
		}).catch((err) => {
			reject(err)
		})
	})
}
export { ridlistText, chapterText }
