import os

log_path = "/home/ec2-user/.pm2/logs/hudd-dashboard-error-0.log"
output_path = "/home/ec2-user/dev/hudd-dashboard/log_search_results.txt"

if os.path.exists(log_path):
    results = []
    with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
        lines = f.readlines()
    
    # We want to find recent errors (lines starting from end, looking for Stack traces or error keywords)
    # Let's group lines into stack traces or search for keywords.
    keywords = ["admin", "users", "rbac", "error", "exception", "failed", "500", "crash", "cannot read"]
    
    # Let's find matches and include some context lines
    for i, line in enumerate(lines):
        if any(kw in line.lower() for kw in keywords):
            # store index and line
            results.append((i, line))
            
    # Let's write the last 200 matches with their surrounding context (up to 3 lines before and after)
    context_lines = []
    seen = set()
    for idx, line in results[-100:]:
        start = max(0, idx - 3)
        end = min(len(lines), idx + 5)
        context_lines.append(f"--- Match at line {idx+1} ---")
        for j in range(start, end):
            if j not in seen:
                context_lines.append(f"{j+1}: {lines[j].strip()}")
                seen.add(j)
                
    with open(output_path, "w", encoding="utf-8") as f:
        f.write("\n".join(context_lines))
    print(f"Done search. Wrote results to {output_path}")
else:
    with open(output_path, "w", encoding="utf-8") as f:
        f.write("Log file not found.\n")
