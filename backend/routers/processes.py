from typing import Dict, Any, List
import os
import glob
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_user, require_admin
from models import APIResponse, ProcessCreate, User
from services import ProcessService

router = APIRouter(prefix="/api", tags=["processes"])




@router.get("/processes", response_model=APIResponse)
async def list_processes(current_user: User = Depends(get_current_user)):
    """Return processes the current user is allowed to run."""
    try:
        procs = ProcessService.list_processes(current_user.role)
        return APIResponse(success=True, data=[p.model_dump() for p in procs])
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/scripts", response_model=APIResponse)
async def list_available_scripts(current_user: User = Depends(require_admin)):
    """Return list of available Python scripts for admin to choose from."""
    try:
        # Get the backend directory
        backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        scripts_dir = os.path.join(backend_dir, "scripts")
        
        # Find all Python files recursively
        script_files = []
        if os.path.exists(scripts_dir):
            # Use glob to find .py files recursively
            pattern = os.path.join(scripts_dir, "**", "*.py")
            for file_path in glob.glob(pattern, recursive=True):
                # Get relative path from scripts directory
                rel_path = os.path.relpath(file_path, backend_dir)
                # Replace backslashes with forward slashes for consistency
                rel_path = rel_path.replace("\\", "/")
                
                # Get just the filename for display
                filename = os.path.basename(file_path)
                
                script_files.append({
                    "path": rel_path,
                    "name": filename,
                    "display": f"{filename} ({rel_path})"
                })
        
        # Sort by filename
        script_files.sort(key=lambda x: x["name"])
        
        return APIResponse(success=True, data=script_files)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/process/{proc_id}/run", response_model=APIResponse)
async def run_process(proc_id: int, params: Dict[str, Any] | None = None, current_user: User = Depends(get_current_user)):
    """Execute a process with optional parameters."""
    try:
        proc = ProcessService.get_process(proc_id)
        if not proc or not proc.is_active:
            raise HTTPException(status_code=404, detail="Process not found")
        if (
            str(current_user.role).strip().lower() != "admin"
            and proc.role
            and str(current_user.role).strip().upper() not in {r.strip().upper() for r in str(proc.role).split(",")}
        ):
            raise HTTPException(status_code=403, detail="Access denied")

        output = ProcessService.run_process(proc_id, params or {})
        return APIResponse(success=True, message="Process executed", data={"output": output})
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ------------------ Admin endpoints ------------------


@router.post("/process", response_model=APIResponse)
async def create_process(request: ProcessCreate, current_user: User = Depends(require_admin)):
    try:
        proc_id = ProcessService.create_process(request)
        return APIResponse(success=True, message="Process created", data={"process_id": proc_id})
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.put("/process/{proc_id}", response_model=APIResponse)
async def update_process(proc_id: int, request: ProcessCreate, current_user: User = Depends(require_admin)):
    try:
        ProcessService.update_process(proc_id, request)
        return APIResponse(success=True, message="Process updated")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.delete("/process/{proc_id}", response_model=APIResponse)
async def delete_process(proc_id: int, current_user: User = Depends(require_admin)):
    try:
        ProcessService.delete_process(proc_id)
        return APIResponse(success=True, message="Process deleted")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) 
