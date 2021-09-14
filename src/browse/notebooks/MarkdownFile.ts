export class MarkdownFile {
    public static parseContent(content: string): MarkdownFile {
        return new MarkdownFile(parseMarkdownParts(content))
    }
    constructor(public readonly parts: MarkdownPart[]) {}
    public renderAsString(): string {
        const lines: string[] = []
        for (const part of this.parts) {
            if (part.startBackticks) {
                lines.push(part.startBackticks)
            }
            lines.push(part.value)
            if (part.endBackticks) {
                lines.push(part.endBackticks)
            }
        }
        return lines.join('\n')
    }
}

function parseMarkdownParts(content: string): MarkdownPart[] {
    const lines = content.split(/\r?\n/g)
    const result: MarkdownPart[] = []
    let i = 0
    while (i < lines.length) {
        const line = lines[i]
        if (line.startsWith('```sourcegraph')) {
            i += 1
            const query: string[] = []
            let isEmittedPart = false
            while (i < lines.length) {
                const queryLine = lines[i]
                if (queryLine.startsWith('```')) {
                    console.log(`startBack=${line} endBack=${queryLine}`)
                    result.push(new MarkdownPart(MarkdownPartKind.CODE_FENCE, query.join('\n'), line, queryLine))
                    isEmittedPart = true
                    break
                } else {
                    query.push(queryLine)
                    i += 1
                }
            }
            if (!isEmittedPart) {
                result.push(new MarkdownPart(MarkdownPartKind.CODE_FENCE, query.join('\n'), line))
            }
        } else {
            result.push(new MarkdownPart(MarkdownPartKind.MARKUP, line))
        }
        i += 1
    }
    return result
}

export enum MarkdownPartKind {
    MARKUP = 1,
    CODE_FENCE = 2,
}

export class MarkdownPart {
    constructor(
        public readonly kind: MarkdownPartKind,
        public readonly value: string,
        public readonly startBackticks?: string,
        public readonly endBackticks?: string
    ) {}
}
