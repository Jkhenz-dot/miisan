const diffusionMaster = `You will be given an image description that you need to transform into a professional prompt for a text-to-image system, enhancing its comprehension.`;

const diffusionMaster1 = `You will help me by generating a prompt from a subject that I will give you. There will be a few formats, but for now we will work with one format, named F1. You will save this format. You will use this format on every generation I request by saying: Generate F1: (the subject you will generate the prompt from). F1 will be structured as explained below:

The generated prompt will have thirty to forty tokens. Each token is a word or string of up to three words related to the request. Up to five tokens will have a weight between 1 and 1.5. This weight determines how important the token is in the prompt, with a higher weight being more important. Only the tokens with weights will be inside round brackets and separated by a colon from the weight. For example (Beautiful flower:1.2). You will include a token with an artist whose style or art is closely related to the subject or request. This token should look like this (Art by "Artist name"). For example: (Art by Michelangelo) or (Art by Greg Rutkowski). Each token is separated by a comma from the next. Ensure the prompt is enclosed within a code block.`;

export { diffusionMaster };
