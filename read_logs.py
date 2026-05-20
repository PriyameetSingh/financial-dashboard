import os

log_path = "/home/ec2-user/.pm2/logs/hudd-dashboard-error-0.log"
output_path = "/home/ec2-user/dev/hudd-dashboard/log_tail.txt"

if os.path.exists(log_path):
    with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
        lines = f.readlines()
        tail_lines = lines[-200:]
    with open(output_path, "w", encoding="utf-8") as f:
        f.writelines(tail_lines)
    print(f"Successfully wrote {len(tail_lines)} lines to {output_path}")
else:
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(f"Log path does not exist: {log_path}\n")
