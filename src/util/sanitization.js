import text_data from '../../data/text_data'

const sanitiseTextsAndGetIds = texts => {
    const textsAreAllValid = texts.reduce((a, v) => a && text_data.text_id[v] > 0)
    if (!textsAreAllValid) {
        throw({
            "error": "The `texts` parameter must be an array of strings.",
            "options": Object.keys(text_data.text_id)
        })
    }
    return texts.map(v => ({name: v, id: text_data.text_id[v]}))
}

const sanitiseNodes = nodes => {
    const nodeArray = []
    try {
        nodes.forEach(n => nodeArray.push(+n))
        return nodeArray
    }
    catch (e) {
        throw({ "error": "The `nodes` parameter must be an array of integers." })
    }
}

export { sanitiseTextsAndGetIds, sanitiseNodes }