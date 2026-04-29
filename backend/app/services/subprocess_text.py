def decode_output(raw: bytes | None) -> str:
    if not raw:
        return ""

    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return raw.decode("utf-8", errors="replace")


def merge_stdout_stderr(stdout: bytes | None, stderr: bytes | None) -> str:
    text_parts = [decode_output(stdout), decode_output(stderr)]
    return "\n".join(part.strip() for part in text_parts if part and part.strip()).strip()
