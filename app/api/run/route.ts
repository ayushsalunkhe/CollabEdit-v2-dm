import { NextResponse } from "next/server"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { source_code, language_id } = body || {}
    if (!source_code || !language_id) {
      return new NextResponse("Missing source_code or language_id", { status: 400 })
    }

    const apiKey = process.env.JUDGE0_API_KEY
    const host = process.env.JUDGE0_API_HOST || "judge0-ce.p.rapidapi.com"

    if (!apiKey) {
      return new NextResponse("JUDGE0_API_KEY is not set on the server.", { status: 500 })
    }

    const url = `https://${host}/submissions?base64_encoded=false&wait=true`
    const resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-RapidAPI-Key": apiKey,
        "X-RapidAPI-Host": host,
      },
      body: JSON.stringify({
        source_code,
        language_id,
      }),
    })

    if (!resp.ok) {
      const text = await resp.text()
      return new NextResponse(text || "Judge0 error", { status: 502 })
    }

    const data = await resp.json()
    return NextResponse.json({
      stdout: data.stdout || "",
      stderr: data.stderr || "",
      compile_output: data.compile_output || "",
      status: data.status || {},
    })
  } catch (e: any) {
    return new NextResponse(e?.message || "Unexpected error", { status: 500 })
  }
}
