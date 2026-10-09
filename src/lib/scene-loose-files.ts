/**
 * 작품 폴더에 그냥 넣어 둔 이미지를 씬에 나눠 담는 규칙.
 * 1) 파일 이름이 씬 이름으로 시작하면 그 씬 ("2 - 웃음_1.png" → 씬 "2 - 웃음")
 * 2) 아니면 파일 이름 맨 앞의 숫자와 씬 이름 맨 앞의 숫자가 같은 씬 ("2.png", "2_1.png" → 씬 "2 - 웃음")
 * 3) 씬 이름에 숫자가 하나도 없는 작품이면 숫자를 씬 순서로 본다 ("3.png" → 세 번째 씬)
 * 어느 것에도 안 맞는 파일은 건드리지 않는다.
 */
export interface LooseScene {
    id: string
    name: string
}

export interface LooseFilePlan {
    matches: Array<{ fileName: string; sceneId: string }>
    unmatched: string[]
}

/** 이름 맨 앞의 숫자 ("017 - 술" → 17). 없으면 null. */
export function leadingNumber(name: string): number | null {
    const match = /^\s*[\[(#]?\s*(\d{1,6})/.exec(name)
    return match ? Number(match[1]) : null
}

const stem = (fileName: string) => fileName.replace(/\.[a-z0-9]+$/i, '')
const normalize = (text: string) => text.normalize('NFC').toLocaleLowerCase().replace(/\s+/g, ' ').trim()
/** 폴더 이름으로 못 쓰는 글자는 _ 로 바뀌어 저장되므로 비교할 때도 같게 본다. */
const fileSafe = (text: string) => normalize(text.replace(/[<>:"/\\|?*]/g, '_').replace(/[. ]+$/, ''))

export function planLooseFiles(scenes: readonly LooseScene[], fileNames: readonly string[]): LooseFilePlan {
    const plan: LooseFilePlan = { matches: [], unmatched: [] }
    // 긴 이름부터 본다: "1"과 "10 - 경멸" 이 둘 다 있을 때 "10 - 경멸_1.png" 가 "1"에 붙지 않게.
    const byName = scenes
        .map(scene => ({ id: scene.id, key: fileSafe(scene.name) }))
        .filter(scene => scene.key.length > 0)
        .sort((a, b) => b.key.length - a.key.length)

    const byNumber = new Map<number, string | null>()
    let anyNumbered = false
    for (const scene of scenes) {
        const number = leadingNumber(scene.name)
        if (number === null) continue
        anyNumbered = true
        // 같은 숫자의 씬이 둘이면 어느 쪽인지 알 수 없으니 숫자로는 맞추지 않는다.
        byNumber.set(number, byNumber.has(number) ? null : scene.id)
    }

    for (const fileName of fileNames) {
        const name = fileSafe(stem(fileName))
        const named = byName.find(scene => {
            if (!name.startsWith(scene.key)) return false
            const rest = name.slice(scene.key.length)
            // 씬 이름 바로 뒤가 숫자면 다른 씬일 수 있다 ("1" 뒤에 "0 - 경멸").
            return rest === '' || !/^\d/.test(rest) || !/\d$/.test(scene.key)
        })
        if (named) {
            plan.matches.push({ fileName, sceneId: named.id })
            continue
        }
        const number = leadingNumber(stem(fileName))
        let sceneId: string | null | undefined = number === null ? undefined : byNumber.get(number)
        if (sceneId === undefined && number !== null && !anyNumbered) sceneId = scenes[number - 1]?.id
        if (sceneId) plan.matches.push({ fileName, sceneId })
        else plan.unmatched.push(fileName)
    }
    return plan
}
