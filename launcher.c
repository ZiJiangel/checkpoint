#include <windows.h>
#include <stdio.h>
#include <string.h>

void dir_of(const char* path, char* out, int outsz) {
    strncpy(out, path, outsz - 1);
    out[outsz - 1] = 0;
    char* p = strrchr(out, '\\');
    if (p) *p = 0;
}

int file_exists(const char* p) {
    DWORD a = GetFileAttributesA(p);
    return a != INVALID_FILE_ATTRIBUTES && !(a & FILE_ATTRIBUTE_DIRECTORY);
}

// 依次尝试：返回第一个存在的 python 路径，否则 NULL
const char* find_python(char* buf, int bufsz) {
    char home[MAX_PATH] = {0};
    char tmp[MAX_PATH];

    // 1) 用户目录下的 Anaconda / miniconda
    if (GetEnvironmentVariableA("USERPROFILE", home, MAX_PATH)) {
        const char* subs[] = {
            "\\anaconda3\\pythonw.exe", "\\Anaconda3\\pythonw.exe",
            "\\miniconda3\\pythonw.exe", "\\Miniconda3\\pythonw.exe",
            "\\AppData\\Local\\anaconda3\\pythonw.exe",
            NULL
        };
        for (int i = 0; subs[i]; i++) {
            snprintf(tmp, MAX_PATH, "%s%s", home, subs[i]);
            if (file_exists(tmp)) { strncpy(buf, tmp, bufsz); return buf; }
        }
    }
    // 2) 全系统常见位置
    const char* common[] = {
        "C:\\ProgramData\\Anaconda3\\pythonw.exe",
        "C:\\ProgramData\\anaconda3\\pythonw.exe",
        "C:\\Anaconda3\\pythonw.exe",
        "D:\\Anaconda3\\pythonw.exe",
        NULL
    };
    for (int i = 0; common[i]; i++) {
        if (file_exists(common[i])) { strncpy(buf, common[i], bufsz); return buf; }
    }
    // 3) PATH 里的 pythonw
    strncpy(buf, "pythonw.exe", bufsz);
    return buf;
}

int main() {
    char exePath[MAX_PATH];
    GetModuleFileNameA(NULL, exePath, MAX_PATH);
    char dir[MAX_PATH];
    dir_of(exePath, dir, MAX_PATH);

    char py[MAX_PATH];
    find_python(py, MAX_PATH);

    char script[MAX_PATH];
    snprintf(script, MAX_PATH, "%s\\app.py", dir);

    char cmd[MAX_PATH * 2];
    snprintf(cmd, sizeof(cmd), "\"%s\" \"%s\"", py, script);

    STARTUPINFOA si;
    PROCESS_INFORMATION pi;
    ZeroMemory(&si, sizeof(si));
    si.cb = sizeof(si);
    ZeroMemory(&pi, sizeof(pi));

    if (!CreateProcessA(NULL, cmd, NULL, NULL, FALSE, 0, NULL, dir, &si, &pi)) {
        char msg[MAX_PATH * 2];
        snprintf(msg, sizeof(msg),
            "启动失败。\n\n找不到 Python 或无法运行。\n\n"
            "尝试的 Python：\n%s\n\n"
            "请确认已安装 Anaconda（或 Python 在 PATH 中）。\n\n错误码：%lu",
            py, GetLastError());
        MessageBoxA(NULL, msg, "集群快照管理器", MB_ICONERROR);
        return 1;
    }
    CloseHandle(pi.hProcess);
    CloseHandle(pi.hThread);
    return 0;
}
