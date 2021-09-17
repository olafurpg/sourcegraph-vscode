import readConfiguration from './readConfiguration'

export default readConfiguration().get<boolean>('debug', false)
